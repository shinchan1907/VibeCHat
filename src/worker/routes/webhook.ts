import { Hono } from 'hono';
import { Env, WabaSettings } from '../types';

export const webhookRouter = new Hono<{ Bindings: Env }>();

/**
 * Meta Webhook Verification (GET /api/webhook)
 */
webhookRouter.get('/', async (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  const settings = await c.env.DB.prepare(
    'SELECT verify_token FROM waba_settings WHERE id = "default"'
  ).first<WabaSettings>();

  // Fail closed: no token configured anywhere = no verification possible.
  // (The previous hard-coded fallback token was public in this repo.)
  const configuredToken = settings?.verify_token || c.env.META_VERIFY_TOKEN || '';

  if (mode === 'subscribe' && token === configuredToken) {
    console.log('✅ Meta Webhook successfully verified with challenge');
    return c.text(challenge || '', 200);
  }

  console.warn('❌ Webhook verification failed. Token mismatch.');
  return c.text('Forbidden: Invalid verify token', 403);
});

/** Timing-safe string comparison for HMAC signatures. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Meta Webhook Receiver (POST /api/webhook)
 *
 * SECURITY: Meta signs every webhook POST with X-Hub-Signature-256
 * (HMAC-SHA256 of the raw body, keyed with the Meta App Secret).
 * Without this check ANYONE on the internet could inject fake customer
 * messages, fake delivery statuses, and trigger chatbot/bot replies
 * (real WhatsApp sends billed to this business). Verification is
 * enforced as soon as an App Secret is saved in Settings; before that
 * the endpoint logs a warning so initial setup can still proceed.
 */
webhookRouter.post('/', async (c) => {
  const rawBody = await c.req.text();

  const settingsRow = await c.env.DB.prepare(
    'SELECT app_secret FROM waba_settings WHERE id = "default"'
  ).first<WabaSettings>();
  const appSecret = settingsRow?.app_secret;

  if (appSecret) {
    const signature = c.req.header('x-hub-signature-256') || '';
    const expected = 'sha256=' + (await hmacSha256Hex(appSecret, rawBody));
    if (!signature || !timingSafeEqual(signature, expected)) {
      console.warn('❌ Webhook rejected: invalid X-Hub-Signature-256');
      return c.text('Forbidden: Invalid signature', 401);
    }
  } else {
    console.warn('⚠️ Webhook accepted WITHOUT signature verification — no Meta App Secret configured yet. Save it in Settings > WABA to enforce verification.');
  }

  let body: any = null;
  try {
    body = JSON.parse(rawBody);
  } catch {
    body = null;
  }

  if (!body || body.object !== 'whatsapp_business_account') {
    return c.text('EVENT_RECEIVED', 200);
  }

  // Log raw event for debugging / audit
  const logId = `wb_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  await c.env.DB.prepare(
    'INSERT INTO activity_logs (id, event_type, description, details) VALUES (?, ?, ?, ?)'
  ).bind(
    logId,
    'webhook_event',
    `Webhook received with ${body.entry?.[0]?.changes?.length || 0} change(s)`,
    JSON.stringify(body)
  ).run();

  try {
    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        if (!value) continue;

        // 1. Process Message Status Updates (sent, delivered, read, failed)
        if (value.statuses && Array.isArray(value.statuses)) {
          for (const status of value.statuses) {
            const wamid = status.id;
            const newStatus = status.status; // 'sent' | 'delivered' | 'read' | 'failed'
            const timestamp = status.timestamp ? new Date(parseInt(status.timestamp) * 1000).toISOString() : new Date().toISOString();

            let errorCode = null;
            let errorMessage = null;
            if (status.errors && status.errors.length > 0) {
              errorCode = status.errors[0].code?.toString() || null;
              errorMessage = status.errors[0].message || status.errors[0].title || null;
            }

            // Update in messages table
            await c.env.DB.prepare(
              'UPDATE messages SET status = ?, error_code = COALESCE(?, error_code), error_message = COALESCE(?, error_message) WHERE wamid = ?'
            ).bind(newStatus, errorCode, errorMessage, wamid).run();

            // Update in broadcast recipients if part of a broadcast
            const recipient = await c.env.DB.prepare(
              'SELECT * FROM broadcast_recipients WHERE wamid = ?'
            ).bind(wamid).first<any>();

            if (recipient) {
              let updateRecipientCol = 'status = ?';
              if (newStatus === 'delivered') updateRecipientCol += ', delivered_at = ?';
              if (newStatus === 'read') updateRecipientCol += ', read_at = ?';

              if (newStatus === 'delivered' || newStatus === 'read') {
                await c.env.DB.prepare(
                  `UPDATE broadcast_recipients SET ${updateRecipientCol} WHERE id = ?`
                ).bind(newStatus, timestamp, recipient.id).run();
              } else {
                await c.env.DB.prepare(
                  `UPDATE broadcast_recipients SET status = ?, error_message = ? WHERE id = ?`
                ).bind(newStatus, errorMessage, recipient.id).run();
              }

              // Update broadcast counters
              if (newStatus === 'delivered') {
                await c.env.DB.prepare(
                  'UPDATE broadcasts SET delivered_count = delivered_count + 1 WHERE id = ?'
                ).bind(recipient.broadcast_id).run();
              } else if (newStatus === 'read') {
                await c.env.DB.prepare(
                  'UPDATE broadcasts SET read_count = read_count + 1 WHERE id = ?'
                ).bind(recipient.broadcast_id).run();
              } else if (newStatus === 'failed') {
                await c.env.DB.prepare(
                  'UPDATE broadcasts SET failed_count = failed_count + 1 WHERE id = ?'
                ).bind(recipient.broadcast_id).run();
              }
            }
          }
        }

        // 2. Process Inbound Messages
        if (value.messages && Array.isArray(value.messages)) {
          const profileContact = value.contacts?.[0];
          const contactProfileName = profileContact?.profile?.name || null;

          for (const msg of value.messages) {
            const customerPhone = msg.from; // E.164 phone number
            const wamid = msg.id;
            const msgType = msg.type;
            const nowIso = new Date().toISOString();

            // Determine message content & media
            let content = '';
            let mediaUrl = null;
            let mediaMime = null;
            let mediaCaption = null;

            if (msgType === 'text') {
              content = msg.text?.body || '';
            } else if (msgType === 'image') {
              content = '[Image]';
              mediaMime = msg.image?.mime_type;
              mediaCaption = msg.image?.caption || '';
              mediaUrl = msg.image?.id ? `/api/media/proxy/${msg.image.id}` : null;
            } else if (msgType === 'document') {
              content = `[Document: ${msg.document?.filename || 'File'}]`;
              mediaMime = msg.document?.mime_type;
              mediaCaption = msg.document?.caption || '';
              mediaUrl = msg.document?.id ? `/api/media/proxy/${msg.document.id}` : null;
            } else if (msgType === 'audio') {
              content = msg.audio?.voice ? '[Voice Note]' : '[Audio]';
              mediaMime = msg.audio?.mime_type;
              mediaUrl = msg.audio?.id ? `/api/media/proxy/${msg.audio.id}` : null;
            } else if (msgType === 'video') {
              content = '[Video]';
              mediaMime = msg.video?.mime_type;
              mediaCaption = msg.video?.caption || '';
              mediaUrl = msg.video?.id ? `/api/media/proxy/${msg.video.id}` : null;
            } else if (msgType === 'interactive') {
              if (msg.interactive?.type === 'button_reply') {
                content = `🔘 ${msg.interactive.button_reply?.title || 'Button Click'}`;
              } else if (msg.interactive?.type === 'list_reply') {
                content = `📋 ${msg.interactive.list_reply?.title || 'List Selection'}`;
              } else if (msg.interactive?.type === 'nfm_reply') {
                // Meta Flow response!
                content = `📝 [Flow Completed]: ${msg.interactive.nfm_reply?.response_json || 'Submitted'}`;
              }
            } else if (msgType === 'button') {
              content = `🔘 ${msg.button?.text || 'Quick Reply'}`;
            } else {
              content = `[${msgType}]`;
            }

            // A. Ensure Contact exists or create
            let contact = await c.env.DB.prepare(
              'SELECT * FROM contacts WHERE phone_number = ?'
            ).bind(customerPhone).first<any>();

            if (!contact) {
              const newContactId = `cnt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
              await c.env.DB.prepare(
                'INSERT INTO contacts (id, phone_number, name, tags, custom_attributes, opt_in_status) VALUES (?, ?, ?, ?, ?, ?)'
              ).bind(
                newContactId,
                customerPhone,
                contactProfileName || `User +${customerPhone}`,
                JSON.stringify(['Inbound Lead']),
                JSON.stringify({}),
                'opted_in'
              ).run();

              contact = { id: newContactId, phone_number: customerPhone, name: contactProfileName };
            } else if (contactProfileName && (!contact.name || contact.name.startsWith('User +'))) {
              // Update name if we have a real WhatsApp profile name now
              await c.env.DB.prepare('UPDATE contacts SET name = ? WHERE id = ?').bind(contactProfileName, contact.id).run();
              contact.name = contactProfileName;
            }

            // B. Ensure Conversation exists
            let conv = await c.env.DB.prepare(
              'SELECT * FROM conversations WHERE contact_id = ?'
            ).bind(contact.id).first<any>();

            if (!conv) {
              const newConvId = `cnv_${Date.now()}_${Math.random().toString(36).substring(7)}`;
              await c.env.DB.prepare(
                'INSERT INTO conversations (id, contact_id, contact_phone, contact_name, last_message_text, last_message_at, last_customer_message_at, unread_count, status) VALUES (?, ?, ?, ?, ?, ?, ?, 1, "open")'
              ).bind(
                newConvId,
                contact.id,
                customerPhone,
                contact.name || customerPhone,
                content,
                nowIso,
                nowIso
              ).run();
              conv = { id: newConvId };
            } else {
              // Update conversation: set last customer message time (resets 24h window!)
              await c.env.DB.prepare(
                'UPDATE conversations SET last_message_text = ?, last_message_at = ?, last_customer_message_at = ?, unread_count = unread_count + 1, status = "open", updated_at = ? WHERE id = ?'
              ).bind(content, nowIso, nowIso, nowIso, conv.id).run();
            }

            // C. Insert Message
            const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            await c.env.DB.prepare(
              'INSERT INTO messages (id, conversation_id, wamid, direction, type, content, media_url, media_mime_type, media_caption, status, raw_payload) VALUES (?, ?, ?, "inbound", ?, ?, ?, ?, ?, "delivered", ?)'
            ).bind(
              msgId,
              conv.id,
              wamid,
              msgType,
              content,
              mediaUrl,
              mediaMime,
              mediaCaption,
              JSON.stringify(msg)
            ).run();

            // D. Check and Trigger Automated Chatbots (If / Else decision tree)
            try {
              const activeBots = await c.env.DB.prepare(
                'SELECT * FROM chatbot_flows WHERE is_active = 1 LIMIT 5'
              ).all<any>();

              for (const bot of activeBots.results || []) {
                const keywords: string[] = typeof bot.trigger_keywords === 'string' ? JSON.parse(bot.trigger_keywords || '[]') : (bot.trigger_keywords || []);
                const lowerContent = (content || '').toLowerCase();
                const matched = keywords.some((k) => lowerContent.includes(k.toLowerCase())) || bot.trigger_type === 'all_inbound';

                if (matched) {
                  const nodes = typeof bot.nodes_json === 'string' ? JSON.parse(bot.nodes_json || '[]') : (bot.nodes_json || []);
                  let botReply = 'Hello! Thanks for reaching out to ByteNex.';
                  let replyButtons: string[] = [];

                  // Find condition node
                  const condNode = nodes.find((n: any) => n.type === 'condition');
                  if (condNode) {
                    const val = (condNode.config?.value || '').toLowerCase();
                    const isTrue = lowerContent.includes(val);
                    if (isTrue) {
                      const branchTrue = nodes.find((n: any) => n.id === 'node_branch_pricing' || n.title?.includes('TRUE'));
                      if (branchTrue) {
                        botReply = branchTrue.config?.text || botReply;
                        replyButtons = branchTrue.config?.buttons || [];
                      }
                    } else {
                      const branchFalse = nodes.find((n: any) => n.id === 'node_branch_general' || n.title?.includes('FALSE'));
                      if (branchFalse) {
                        botReply = branchFalse.config?.text || botReply;
                        replyButtons = branchFalse.config?.buttons || [];
                      }
                    }
                  } else {
                    const msgNode = nodes.find((n: any) => n.type === 'message');
                    if (msgNode) botReply = msgNode.config?.text || botReply;
                  }

                  // Dispatch bot reply back to customer
                  const settings = await c.env.DB.prepare('SELECT * FROM waba_settings WHERE id = "default"').first<any>();
                  const metaApi = new (await import('../services/meta-api')).MetaApiService(settings || { id: 'default' });

                  const botSendRes = await metaApi.sendMessage({
                    to: customerPhone,
                    type: replyButtons.length > 0 ? 'interactive' : 'text',
                    text: botReply,
                    interactive: replyButtons.length > 0 ? {
                      type: 'button',
                      body: { text: botReply },
                      action: {
                        buttons: replyButtons.map((btn, i) => ({
                          type: 'reply',
                          reply: { id: `btn_${i}`, title: btn },
                        })),
                      },
                    } : undefined,
                  });

                  // Record bot outbound message in conversation
                  const botMsgId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
                  await c.env.DB.prepare(
                    'INSERT INTO messages (id, conversation_id, wamid, direction, type, content, status) VALUES (?, ?, ?, "outbound", "text", ?, "sent")'
                  ).bind(botMsgId, conv.id, botSendRes.wamid || null, botReply).run();

                  await c.env.DB.prepare(
                    'UPDATE conversations SET last_message_text = ?, last_message_at = ? WHERE id = ?'
                  ).bind(`🤖 ${botReply}`, new Date().toISOString(), conv.id).run();

                  // Increment bot execution count
                  await c.env.DB.prepare(
                    'UPDATE chatbot_flows SET execution_count = execution_count + 1 WHERE id = ?'
                  ).bind(bot.id).run();

                  break; // Trigger first matching bot
                }
              }
            } catch (botErr) {
              console.warn('Bot workflow execution notice:', botErr);
            }
          }
        }
      }
    }
  } catch (err: any) {
    console.error('Error handling webhook payload:', err);
  }

  return c.text('EVENT_RECEIVED', 200);
});
