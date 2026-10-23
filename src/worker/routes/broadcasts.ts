import { Hono } from 'hono';
import { Env, WabaSettings } from '../types';
import { MetaApiService } from '../services/meta-api';
import { buildTemplateComponents, renderTemplateContent, MEDIA_HEADER_TYPES } from '../services/template-render';

export const broadcastsRouter = new Hono<{ Bindings: Env }>();

/**
 * List all broadcasts with metrics
 */
broadcastsRouter.get('/', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT 50'
  ).all<any>();

  // Reply counts per broadcast (recipients who replied after the send)
  const replyRows: any = await c.env.DB.prepare(
    `SELECT br.broadcast_id AS bid, COUNT(DISTINCT br.id) AS n
     FROM broadcast_recipients br
     JOIN broadcasts b ON b.id = br.broadcast_id
     JOIN conversations cv ON cv.contact_phone = br.phone_number
     JOIN messages m ON m.conversation_id = cv.id AND m.direction = 'inbound'
       AND datetime(m.created_at) >= datetime(b.started_at)
     GROUP BY br.broadcast_id`
  ).all();
  const replyMap = new Map<string, number>((replyRows.results || []).map((r: any) => [r.bid, r.n]));

  const cfgRows: any = await c.env.DB.prepare('SELECT * FROM broadcast_send_config').all();
  const cfgMap = new Map<string, any>((cfgRows.results || []).map((r: any) => [r.broadcast_id, r]));

  const broadcasts = (rows.results || []).map((b) => ({
    ...b,
    variable_mappings: typeof b.variable_mappings === 'string' ? JSON.parse(b.variable_mappings || '[]') : (b.variable_mappings || []),
    target_tags: typeof b.target_tags === 'string' ? JSON.parse(b.target_tags || '[]') : (b.target_tags || []),
    replies_count: replyMap.get(b.id) || 0,
    retry_enabled: cfgMap.get(b.id)?.retry_enabled || 0,
    retry_window_hours: cfgMap.get(b.id)?.retry_window_hours || 0,
  }));

  return c.json({ success: true, broadcasts });
});

/**
 * Get broadcast campaign details & recipient log
 */
broadcastsRouter.get('/:id', async (c) => {
  const broadcastId = c.req.param('id');

  const broadcast = await c.env.DB.prepare(
    'SELECT * FROM broadcasts WHERE id = ?'
  ).bind(broadcastId).first<any>();

  if (!broadcast) {
    return c.json({ success: false, error: 'Broadcast not found' }, 404);
  }

  const recipients = await c.env.DB.prepare(
    `SELECT br.*, ct.name as contact_name
     FROM broadcast_recipients br
     LEFT JOIN contacts ct ON br.contact_id = ct.id
     WHERE br.broadcast_id = ?
     ORDER BY br.sent_at DESC
     LIMIT 500`
  ).bind(broadcastId).all<any>();

  const config = await c.env.DB.prepare('SELECT * FROM broadcast_send_config WHERE broadcast_id = ?').bind(broadcastId).first<any>();

  const analytics = await computeBroadcastAnalytics(c.env.DB, broadcast, recipients.results || []);

  return c.json({
    success: true,
    broadcast: {
      ...broadcast,
      variable_mappings: typeof broadcast.variable_mappings === 'string' ? JSON.parse(broadcast.variable_mappings || '[]') : (broadcast.variable_mappings || []),
      target_tags: typeof broadcast.target_tags === 'string' ? JSON.parse(broadcast.target_tags || '[]') : (broadcast.target_tags || []),
      retry_enabled: config?.retry_enabled || 0,
      retry_window_hours: config?.retry_window_hours || 0,
    },
    analytics,
    recipients: recipients.results || [],
  });
});

async function computeBroadcastAnalytics(db: any, broadcast: any, recipients: any[]) {
  const total = recipients.length;
  const read = recipients.filter((r) => r.status === 'read').length;
  const deliveredOnly = recipients.filter((r) => r.status === 'delivered').length;
  const delivered = deliveredOnly + read; // read implies delivered
  const failed = recipients.filter((r) => r.status === 'failed').length;
  const accepted = total - failed; // Meta accepted (sent/delivered/read)
  const inFlight = recipients.filter((r) => r.status === 'sent').length;

  // Replies: recipients who sent any inbound message after the broadcast start
  let replies = 0;
  if (broadcast.started_at && total > 0) {
    const row: any = await db.prepare(
      `SELECT COUNT(DISTINCT br.id) AS n
       FROM broadcast_recipients br
       JOIN conversations cv ON cv.contact_phone = br.phone_number
       JOIN messages m ON m.conversation_id = cv.id AND m.direction = 'inbound'
         AND datetime(m.created_at) >= datetime(?)
       WHERE br.broadcast_id = ?`
    ).bind(broadcast.started_at, broadcast.id).first();
    replies = row?.n || 0;
  }

  const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);
  return {
    total_recipients: total,
    accepted,
    delivered,
    read,
    failed,
    in_flight: inFlight,
    replies,
    delivery_rate: pct(delivered, accepted),
    read_rate: pct(read, delivered),
    fail_rate: pct(failed, total),
    reply_rate: pct(replies, delivered || accepted),
  };
}

/**
 * Upload header media for a broadcast to Meta (returns a media id that the
 * template send references — no public URL needed).
 */
broadcastsRouter.post('/header-media', async (c) => {
  const settings = await c.env.DB.prepare('SELECT * FROM waba_settings WHERE id = "default"').first<any>();
  if (!settings?.access_token || !settings?.phone_number_id) {
    return c.json({ success: false, error: 'WABA is not configured yet' }, 400);
  }
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') {
    return c.json({ success: false, error: 'No file uploaded' }, 400);
  }
  if (file.size > 16 * 1024 * 1024) {
    return c.json({ success: false, error: 'Header media must be 16MB or smaller' }, 400);
  }
  const metaForm = new FormData();
  metaForm.append('messaging_product', 'whatsapp');
  metaForm.append('type', file.type || 'application/octet-stream');
  metaForm.append('file', file, file.name || 'header-media');
  const res = await fetch(`https://graph.facebook.com/v21.0/${settings.phone_number_id}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${settings.access_token}` },
    body: metaForm,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    return c.json({ success: false, error: data?.error?.message || 'Meta media upload failed' }, 502);
  }
  return c.json({ success: true, media_id: data.id, filename: file.name });
});

/**
 * Send ONE test copy of a template to a single number (pre-broadcast check).
 * Logged into that contact's chat, clearly marked as a test.
 */
broadcastsRouter.post('/test-send', async (c) => {
  const payload = await c.req.json<{
    template_id: string;
    phone_number: string;
    variables?: string[];
    header_media_id?: string;
  }>();
  if (!payload.template_id || !payload.phone_number) {
    return c.json({ success: false, error: 'Template and test phone number are required' }, 400);
  }
  const template = await c.env.DB.prepare('SELECT * FROM templates WHERE id = ?').bind(payload.template_id).first<any>();
  if (!template) {
    return c.json({ success: false, error: 'Selected template not found' }, 404);
  }
  if (MEDIA_HEADER_TYPES.includes(template.header_type || '') && !payload.header_media_id) {
    return c.json({ success: false, error: `This template has a ${String(template.header_type).toLowerCase()} header — upload the header media before the test send.` }, 400);
  }
  const phone = payload.phone_number.replace(/\D/g, '');
  const settings = await c.env.DB.prepare('SELECT * FROM waba_settings WHERE id = "default"').first<WabaSettings>();
  const metaApi = new MetaApiService(settings || { id: 'default' });
  const components = buildTemplateComponents(template, payload.variables || [], payload.header_media_id);
  const sendRes = await metaApi.sendMessage({
    to: phone,
    type: 'template',
    template: {
      name: template.name,
      language: { code: template.language || 'en_US' },
      components: components.length > 0 ? components : undefined,
    },
  });
  if (!sendRes.success) {
    return c.json({ success: false, error: sendRes.error || 'Test send failed' }, 400);
  }

  // Log into the contact's conversation so the test is visible in the chat
  try {
    let contact = await c.env.DB.prepare('SELECT * FROM contacts WHERE phone_number = ?').bind(phone).first<any>();
    if (!contact) {
      const cid = `cnt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await c.env.DB.prepare('INSERT INTO contacts (id, phone_number, name, tags, custom_attributes, opt_in_status) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(cid, phone, `+${phone}`, JSON.stringify([]), JSON.stringify({}), 'opted_in').run();
      contact = { id: cid, name: `+${phone}` };
    }
    let conv = await c.env.DB.prepare('SELECT * FROM conversations WHERE contact_id = ?').bind(contact.id).first<any>();
    const nowIso = new Date().toISOString();
    if (!conv) {
      const convId = `cnv_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await c.env.DB.prepare('INSERT INTO conversations (id, contact_id, contact_phone, contact_name, last_message_text, last_message_at, unread_count, status) VALUES (?, ?, ?, ?, ?, ?, 0, "open")')
        .bind(convId, contact.id, phone, contact.name || phone, `🧪 Test: ${template.name}`, nowIso).run();
      conv = { id: convId };
    } else {
      await c.env.DB.prepare('UPDATE conversations SET last_message_text = ?, last_message_at = ?, updated_at = ? WHERE id = ?')
        .bind(`🧪 Test: ${template.name}`, nowIso, nowIso, conv.id).run();
    }
    await c.env.DB.prepare(
      'INSERT INTO messages (id, conversation_id, wamid, direction, type, content, status, created_at) VALUES (?, ?, ?, "outbound", "template", ?, "sent", ?)'
    ).bind(
      `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      conv.id,
      sendRes.wamid || null,
      `🧪 TEST SEND\n${renderTemplateContent(template, payload.variables || [], contact.name)}`,
      nowIso
    ).run();
  } catch (e) {
    console.warn('test-send conversation logging failed:', e);
  }

  return c.json({ success: true, wamid: sendRes.wamid });
});

/**
 * Create and dispatch a broadcast campaign
 */
broadcastsRouter.post('/', async (c) => {
  const payload = await c.req.json<{
    name: string;
    template_id: string;
    target_type: 'all' | 'tags' | 'numbers';
    target_tags?: string[];
    phone_numbers?: string[]; // for manual or CSV paste
    variables?: string[];
    header_media_id?: string; // Meta media id from POST /broadcasts/header-media
    retry_enabled?: boolean;
    retry_window_hours?: number; // 6 | 24 | 48 | 72
  }>();

  if (!payload.name || !payload.template_id) {
    return c.json({ success: false, error: 'Broadcast name and template selection are required' }, 400);
  }

  // Load template details
  const template = await c.env.DB.prepare('SELECT * FROM templates WHERE id = ?').bind(payload.template_id).first<any>();
  if (!template) {
    return c.json({ success: false, error: 'Selected template not found' }, 404);
  }

  // Media-header templates cannot be sent without a header media attachment.
  const MEDIA_HEADER_TYPES = ['IMAGE', 'VIDEO', 'DOCUMENT'];
  if (MEDIA_HEADER_TYPES.includes(template.header_type || '') && !payload.header_media_id) {
    return c.json({ success: false, error: `This template has a ${String(template.header_type).toLowerCase()} header — upload the header media before launching the broadcast.` }, 400);
  }

  // Find recipients based on target_type. All lookups are batched/paged —
  // per-row queries here previously blew the Worker subrequest limit on
  // lists over ~1000 numbers (HTTP 500 before the campaign was even created).
  let targetContacts: any[] = [];

  const fetchAllOptedIn = async (): Promise<any[]> => {
    const out: any[] = [];
    let lastRowid = 0;
    for (;;) {
      const res = await c.env.DB.prepare(
        'SELECT rowid, * FROM contacts WHERE opt_in_status = "opted_in" AND rowid > ? ORDER BY rowid ASC LIMIT 900'
      ).bind(lastRowid).all<any>();
      const batch = res.results || [];
      out.push(...batch);
      if (batch.length < 900) break;
      lastRowid = batch[batch.length - 1].rowid;
    }
    return out;
  };

  if (payload.target_type === 'all') {
    targetContacts = await fetchAllOptedIn();
  } else if (payload.target_type === 'tags' && payload.target_tags && payload.target_tags.length > 0) {
    const allContacts = await fetchAllOptedIn();
    targetContacts = allContacts.filter((ct) => {
      try {
        const tags: string[] = typeof ct.tags === 'string' ? JSON.parse(ct.tags || '[]') : (ct.tags || []);
        return payload.target_tags!.some((t) => tags.includes(t));
      } catch {
        return false;
      }
    });
  } else if (payload.target_type === 'numbers' && payload.phone_numbers) {
    // Dedupe + clean, resolve existing contacts in IN(...) chunks, batch-insert the rest
    const cleaned = [...new Set(payload.phone_numbers.map((p) => p.replace(/\D/g, '')).filter((p) => p.length >= 7))];
    const found = new Map<string, any>();
    const NCHUNK = 100;
    for (let i = 0; i < cleaned.length; i += NCHUNK) {
      const slice = cleaned.slice(i, i + NCHUNK);
      const res = await c.env.DB.prepare(
        `SELECT * FROM contacts WHERE phone_number IN (${slice.map(() => '?').join(',')})`
      ).bind(...slice).all<any>();
      for (const ct of res.results || []) found.set(ct.phone_number, ct);
    }
    const missing = cleaned.filter((p) => !found.has(p));
    for (let i = 0; i < missing.length; i += NCHUNK) {
      const slice = missing.slice(i, i + NCHUNK);
      await c.env.DB.batch(slice.map((clean) => {
        const ctId = `cnt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        found.set(clean, { id: ctId, phone_number: clean, name: `+${clean}` });
        return c.env.DB.prepare(
          'INSERT INTO contacts (id, phone_number, name, tags, opt_in_status) VALUES (?, ?, ?, ?, "opted_in")'
        ).bind(ctId, clean, `+${clean}`, JSON.stringify(['Broadcast List']));
      }));
    }
    targetContacts = cleaned.map((p) => found.get(p)).filter(Boolean);
  }

  if (targetContacts.length === 0) {
    return c.json({ success: false, error: 'No opted-in contacts match the selected target criteria' }, 400);
  }

  // Idempotency guard: an identical campaign already queued/processing in
  // the last 10 minutes is returned instead of creating a duplicate (this is
  // what produced twin campaigns when a launch was double-submitted).
  const dupe = await c.env.DB.prepare(
    `SELECT id FROM broadcasts WHERE name = ? AND template_id = ? AND status IN ("queued", "processing")
       AND datetime(created_at) >= datetime('now', '-10 minutes') ORDER BY created_at DESC LIMIT 1`
  ).bind(payload.name, template.id).first<any>();
  if (dupe) {
    return c.json({ success: true, broadcast_id: dupe.id, duplicate: true, total_recipients: targetContacts.length, queued: true });
  }

  // Create the campaign as QUEUED and queue every recipient. Dispatch happens
  // in the background via the cron-driven queue processor, so the launch
  // request returns instantly and sending survives browser disconnects.
  const broadcastId = `bcast_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const nowIso = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO broadcasts (
      id, name, template_id, template_name, template_language,
      variable_mappings, status, total_recipients, target_tags,
      started_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, "queued", ?, ?, ?, ?)`
  ).bind(
    broadcastId,
    payload.name,
    template.id,
    template.name,
    template.language || 'en_US',
    JSON.stringify(payload.variables || []),
    targetContacts.length,
    JSON.stringify(payload.target_tags || []),
    nowIso,
    nowIso
  ).run();

  // Persist send configuration (header media + retry policy) for analytics
  // and the cron-driven retry engine.
  const retryWindow = [6, 24, 48, 72].includes(payload.retry_window_hours || 0) ? (payload.retry_window_hours as number) : 24;
  await c.env.DB.prepare(
    'INSERT INTO broadcast_send_config (broadcast_id, header_media_id, retry_enabled, retry_window_hours) VALUES (?, ?, ?, ?)'
  ).bind(broadcastId, payload.header_media_id || null, payload.retry_enabled ? 1 : 0, payload.retry_enabled ? retryWindow : 0).run();

  // Queue recipients in batched writes
  const QCHUNK = 100;
  for (let i = 0; i < targetContacts.length; i += QCHUNK) {
    const slice = targetContacts.slice(i, i + QCHUNK);
    await c.env.DB.batch(slice.map((contact) => c.env.DB.prepare(
      'INSERT INTO broadcast_recipients (id, broadcast_id, contact_id, phone_number, status) VALUES (?, ?, ?, ?, "queued")'
    ).bind(`br_${Date.now()}_${Math.random().toString(36).substring(7)}`, broadcastId, contact.id, contact.phone_number)));
  }

  await c.env.DB.prepare(
    'INSERT INTO activity_logs (id, event_type, description, details) VALUES (?, ?, ?, ?)'
  ).bind(
    `log_${Date.now()}`,
    'broadcast_queued',
    `Campaign "${payload.name}" queued for ${targetContacts.length} recipients (background dispatch)`,
    JSON.stringify({ broadcastId })
  ).run();

  return c.json({
    success: true,
    broadcast_id: broadcastId,
    total_recipients: targetContacts.length,
    queued: true,
  });
});

/**
 * Background queue processor (cron, every minute): sends QUEUED broadcast
 * recipients in batches. Each send updates the recipient row, the chat
 * timeline and the campaign counters incrementally, so progress is real and
 * a campaign can never be lost mid-dispatch.
 */
export async function processBroadcastQueue(env: Env): Promise<{ processed: number; sent: number; failed: number }> {
  const db: any = (env as any).DB;
  // Reclaim rows orphaned in 'sending' by an invocation that died mid-flight.
  await db.prepare('UPDATE broadcast_recipients SET status = "queued", error_message = NULL WHERE status = "sending"').run();
  // Claim a batch under a unique token so overlapping invocations (cron tick
  // + manual trigger) can never process the same recipient twice.
  const claimToken = `claim_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const candidates: any = await db.prepare(
    'SELECT id FROM broadcast_recipients WHERE status = "queued" ORDER BY rowid ASC LIMIT 40'
  ).all();
  const candIds = (candidates.results || []).map((r: any) => r.id);
  if (candIds.length === 0) return { processed: 0, sent: 0, failed: 0 };
  await db.prepare(
    `UPDATE broadcast_recipients SET status = "sending", error_message = ? WHERE id IN (${candIds.map(() => '?').join(',')}) AND status = "queued"`
  ).bind(claimToken, ...candIds).run();
  const due: any = await db.prepare(
    `SELECT br.id AS recipient_id, br.broadcast_id, br.contact_id, br.phone_number,
            b.template_id, b.variable_mappings, b.status AS bstatus, cfg.header_media_id
     FROM broadcast_recipients br
     JOIN broadcasts b ON b.id = br.broadcast_id
     LEFT JOIN broadcast_send_config cfg ON cfg.broadcast_id = br.broadcast_id
     WHERE br.status = 'sending' AND br.error_message = ?
     ORDER BY br.rowid ASC`
  ).bind(claimToken).all();
  const rows = due.results || [];

  let sent = 0;
  let failed = 0;
  if (rows.length > 0) {
    const settings = await db.prepare('SELECT * FROM waba_settings WHERE id = "default"').first() as any;
    if (!settings?.access_token) return { processed: 0, sent: 0, failed: 0 };
    const metaApi = new MetaApiService(settings as WabaSettings);
    const touchedBroadcasts = new Set<string>();

    for (const row of rows) {
      const template = await db.prepare('SELECT * FROM templates WHERE id = ?').bind(row.template_id).first() as any;
      const contact = await db.prepare('SELECT * FROM contacts WHERE id = ?').bind(row.contact_id).first() as any;
      const nowIso = new Date().toISOString();
      let isSuccess = false;
      let wamid: string | null = null;
      let errorMsg: string | null = template ? null : 'Template no longer exists';

      if (template && contact) {
        const variables: string[] = typeof row.variable_mappings === 'string' ? JSON.parse(row.variable_mappings || '[]') : (row.variable_mappings || []);
        const personalVars = variables.map((v: string) => (v === '{{name}}' ? (contact.name || 'Customer') : v));
        const components = buildTemplateComponents(template, personalVars, row.header_media_id || undefined);
        const sendRes = await metaApi.sendMessage({
          to: row.phone_number,
          type: 'template',
          template: {
            name: template.name,
            language: { code: template.language || 'en_US' },
            components: components.length > 0 ? components : undefined,
          },
        });
        isSuccess = sendRes.success;
        wamid = sendRes.wamid || null;
        errorMsg = isSuccess ? null : (sendRes.error || 'Failed to dispatch');

        if (isSuccess && contact) {
          // Record in the chat timeline with the full rendered template
          let conv = await db.prepare('SELECT id FROM conversations WHERE contact_id = ?').bind(contact.id).first() as any;
          if (!conv) {
            const convId = `cnv_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            await db.prepare(
              'INSERT INTO conversations (id, contact_id, contact_phone, contact_name, last_message_text, last_message_at, unread_count, status) VALUES (?, ?, ?, ?, ?, ?, 0, "open")'
            ).bind(convId, contact.id, contact.phone_number, contact.name, `📄 Broadcast: ${template.name}`, nowIso).run();
            conv = { id: convId };
          } else {
            await db.prepare('UPDATE conversations SET last_message_text = ?, last_message_at = ?, updated_at = ? WHERE id = ?')
              .bind(`📄 Broadcast: ${template.name}`, nowIso, nowIso, conv.id).run();
          }
          await db.prepare(
            `INSERT INTO messages (id, conversation_id, wamid, direction, type, content, status, raw_payload, created_at)
             VALUES (?, ?, ?, "outbound", "template", ?, "sent", ?, ?)`
          ).bind(
            `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            conv.id,
            wamid,
            renderTemplateContent(template, personalVars, contact.name),
            JSON.stringify(sendRes.raw || {}),
            nowIso
          ).run();
        }
      }

      if (isSuccess) sent++; else failed++;
      await db.prepare('UPDATE broadcast_recipients SET status = ?, wamid = ?, error_message = ?, sent_at = ? WHERE id = ?')
        .bind(isSuccess ? 'sent' : 'failed', wamid, errorMsg, isSuccess ? nowIso : null, row.recipient_id).run();
      await db.prepare(
        `UPDATE broadcasts SET ${isSuccess ? 'sent_count = sent_count + 1' : 'failed_count = failed_count + 1'},
           status = CASE WHEN status = 'queued' THEN 'processing' ELSE status END
         WHERE id = ?`
      ).bind(row.broadcast_id).run();
      touchedBroadcasts.add(row.broadcast_id);
    }

    // Flip campaigns whose queue has drained to completed
    for (const bid of [...touchedBroadcasts]) {
      const remaining = await db.prepare('SELECT COUNT(*) AS n FROM broadcast_recipients WHERE broadcast_id = ? AND status = "queued"').bind(bid).first() as any;
      if ((remaining?.n || 0) === 0) {
        await db.prepare('UPDATE broadcasts SET status = "completed", completed_at = ? WHERE id = ? AND status != "completed"')
          .bind(new Date().toISOString(), bid).run();
      }
    }
  }
  return { processed: rows.length, sent, failed };
}

/**
 * Manual trigger for the background processors (same work the cron does) —
 * also serves as a health check for the queue/retry engines.
 */
broadcastsRouter.post('/process-queue', async (c) => {
  try {
    const queue = await processBroadcastQueue(c.env);
    await runBroadcastRetries(c.env);
    const pending: any = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM broadcast_recipients WHERE status = "queued"').first();
    return c.json({ success: true, queue, queued_remaining: pending?.n || 0 });
  } catch (e: any) {
    return c.json({ success: false, error: e?.message || String(e) }, 500);
  }
});

/**
 * Cron-driven retry engine: re-sends FAILED broadcast messages while the
 * broadcast's retry window (6/24/48/72h from its start) is still open.
 * Runs every 30 minutes via the worker's scheduled handler; per-recipient
 * attempts are spaced at least 20 minutes apart and capped at 10.
 */
export async function runBroadcastRetries(env: Env): Promise<void> {
  const db: any = (env as any).DB;
  const due: any = await db.prepare(
    `SELECT br.id AS recipient_id, br.broadcast_id, br.phone_number, br.wamid AS old_wamid,
            br.contact_id, b.template_id, b.variable_mappings, cfg.header_media_id,
            COALESCE(rs.attempts, 0) AS attempts
     FROM broadcast_recipients br
     JOIN broadcasts b ON b.id = br.broadcast_id
     JOIN broadcast_send_config cfg ON cfg.broadcast_id = br.broadcast_id AND cfg.retry_enabled = 1
     LEFT JOIN broadcast_retry_state rs ON rs.recipient_id = br.id
     WHERE br.status = 'failed'
       AND datetime(b.started_at, '+' || cfg.retry_window_hours || ' hours') > datetime('now')
       AND COALESCE(rs.attempts, 0) < 10
       AND (rs.last_attempt_at IS NULL OR datetime(rs.last_attempt_at, '+20 minutes') <= datetime('now'))
     LIMIT 50`
  ).all();
  const rows = due.results || [];
  if (rows.length === 0) return;

  const settings = await db.prepare('SELECT * FROM waba_settings WHERE id = "default"').first() as any;
  if (!settings?.access_token) return;
  const metaApi = new MetaApiService(settings as WabaSettings);
  const nowIso = new Date().toISOString();

  for (const row of rows) {
    const template = await db.prepare('SELECT * FROM templates WHERE id = ?').bind(row.template_id).first() as any;
    let success = false;
    let newWamid: string | null = null;
    let errMsg: string | null = null;
    if (template) {
      const variables: string[] = typeof row.variable_mappings === 'string' ? JSON.parse(row.variable_mappings || '[]') : (row.variable_mappings || []);
      const contact = await db.prepare('SELECT name FROM contacts WHERE id = ?').bind(row.contact_id).first() as any;
      const personalVars = variables.map((v: string) => (v === '{{name}}' ? (contact?.name || 'Customer') : v));
      const components = buildTemplateComponents(template, personalVars, row.header_media_id || undefined);
      const res = await metaApi.sendMessage({
        to: row.phone_number,
        type: 'template',
        template: {
          name: template.name,
          language: { code: template.language || 'en_US' },
          components: components.length > 0 ? components : undefined,
        },
      });
      success = res.success;
      newWamid = res.wamid || null;
      errMsg = res.success ? null : (res.error || 'Retry dispatch failed');
    } else {
      errMsg = 'Template no longer exists';
    }

    await db.prepare(
      `INSERT INTO broadcast_retry_state (recipient_id, broadcast_id, attempts, last_attempt_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(recipient_id) DO UPDATE SET attempts = attempts + 1, last_attempt_at = excluded.last_attempt_at`
    ).bind(row.recipient_id, row.broadcast_id, (row.attempts || 0) + 1, nowIso).run();

    if (success) {
      await db.prepare('UPDATE broadcast_recipients SET status = "sent", wamid = ?, error_message = NULL, sent_at = ? WHERE id = ?')
        .bind(newWamid, nowIso, row.recipient_id).run();
      if (row.old_wamid) {
        await db.prepare('UPDATE messages SET wamid = ?, status = "sent", error_message = NULL WHERE wamid = ?')
          .bind(newWamid, row.old_wamid).run();
      }
      await db.prepare('UPDATE broadcasts SET sent_count = sent_count + 1, failed_count = MAX(failed_count - 1, 0) WHERE id = ?')
        .bind(row.broadcast_id).run();
    }
  }
}
