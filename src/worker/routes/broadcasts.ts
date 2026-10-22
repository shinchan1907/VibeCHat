import { Hono } from 'hono';
import { Env, WabaSettings } from '../types';
import { MetaApiService } from '../services/meta-api';

export const broadcastsRouter = new Hono<{ Bindings: Env }>();

/**
 * List all broadcasts with metrics
 */
broadcastsRouter.get('/', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT 50'
  ).all<any>();

  const broadcasts = (rows.results || []).map((b) => ({
    ...b,
    variable_mappings: typeof b.variable_mappings === 'string' ? JSON.parse(b.variable_mappings || '[]') : (b.variable_mappings || []),
    target_tags: typeof b.target_tags === 'string' ? JSON.parse(b.target_tags || '[]') : (b.target_tags || []),
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

  return c.json({
    success: true,
    broadcast: {
      ...broadcast,
      variable_mappings: typeof broadcast.variable_mappings === 'string' ? JSON.parse(broadcast.variable_mappings || '[]') : (broadcast.variable_mappings || []),
      target_tags: typeof broadcast.target_tags === 'string' ? JSON.parse(broadcast.target_tags || '[]') : (broadcast.target_tags || []),
    },
    recipients: recipients.results || [],
  });
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
  }>();

  if (!payload.name || !payload.template_id) {
    return c.json({ success: false, error: 'Broadcast name and template selection are required' }, 400);
  }

  // Load template details
  const template = await c.env.DB.prepare('SELECT * FROM templates WHERE id = ?').bind(payload.template_id).first<any>();
  if (!template) {
    return c.json({ success: false, error: 'Selected template not found' }, 404);
  }

  // Find recipients based on target_type
  let targetContacts: any[] = [];

  if (payload.target_type === 'all') {
    const res = await c.env.DB.prepare('SELECT * FROM contacts WHERE opt_in_status = "opted_in" LIMIT 1000').all<any>();
    targetContacts = res.results || [];
  } else if (payload.target_type === 'tags' && payload.target_tags && payload.target_tags.length > 0) {
    // Retrieve contacts matching any of the tags
    const allContacts = await c.env.DB.prepare('SELECT * FROM contacts WHERE opt_in_status = "opted_in" LIMIT 1000').all<any>();
    targetContacts = (allContacts.results || []).filter((ct) => {
      try {
        const tags: string[] = typeof ct.tags === 'string' ? JSON.parse(ct.tags || '[]') : (ct.tags || []);
        return payload.target_tags!.some((t) => tags.includes(t));
      } catch {
        return false;
      }
    });
  } else if (payload.target_type === 'numbers' && payload.phone_numbers) {
    // Upsert contacts from manual input/CSV
    for (const rawPhone of payload.phone_numbers) {
      const clean = rawPhone.replace(/\D/g, '');
      if (clean.length < 7) continue;

      let ct = await c.env.DB.prepare('SELECT * FROM contacts WHERE phone_number = ?').bind(clean).first<any>();
      if (!ct) {
        const ctId = `cnt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        await c.env.DB.prepare(
          'INSERT INTO contacts (id, phone_number, name, tags, opt_in_status) VALUES (?, ?, ?, ?, "opted_in")'
        ).bind(ctId, clean, `+${clean}`, JSON.stringify(['Broadcast List'])).run();
        targetContacts.push({ id: ctId, phone_number: clean, name: `+${clean}` });
      } else {
        targetContacts.push(ct);
      }
    }
  }

  if (targetContacts.length === 0) {
    return c.json({ success: false, error: 'No opted-in contacts match the selected target criteria' }, 400);
  }

  // Create Broadcast Campaign record
  const broadcastId = `bcast_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const nowIso = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO broadcasts (
      id, name, template_id, template_name, template_language,
      variable_mappings, status, total_recipients, target_tags,
      started_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, "processing", ?, ?, ?, ?)`
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

  // Load WABA settings for dispatch
  const settings = await c.env.DB.prepare('SELECT * FROM waba_settings WHERE id = "default"').first<WabaSettings>();
  const metaApi = new MetaApiService(settings || { id: 'default' });

  // Prepare template parameters
  const templateComponents: any[] = [];
  if (payload.variables && payload.variables.length > 0) {
    templateComponents.push({
      type: 'body',
      parameters: payload.variables.map((val) => ({
        type: 'text',
        text: val,
      })),
    });
  }

  let sentSuccessCount = 0;
  let failedCount = 0;

  // Dispatch sequentially or batch
  for (const contact of targetContacts) {
    const recipientId = `br_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Build personalized parameters if {{name}} is used
    const personalizedComponents = JSON.parse(JSON.stringify(templateComponents));
    if (personalizedComponents[0]?.parameters) {
      personalizedComponents[0].parameters = personalizedComponents[0].parameters.map((p: any) => ({
        ...p,
        text: p.text === '{{name}}' ? (contact.name || 'Customer') : p.text,
      }));
    }

    const sendRes = await metaApi.sendMessage({
      to: contact.phone_number,
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.language || 'en_US' },
        components: personalizedComponents.length > 0 ? personalizedComponents : undefined,
      },
    });

    const isSuccess = sendRes.success;
    const recipientStatus = isSuccess ? 'sent' : 'failed';
    const errorMsg = isSuccess ? null : (sendRes.error || 'Failed to dispatch');

    if (isSuccess) sentSuccessCount++;
    else failedCount++;

    await c.env.DB.prepare(
      `INSERT INTO broadcast_recipients (
        id, broadcast_id, contact_id, phone_number, status, wamid, error_message, sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      recipientId,
      broadcastId,
      contact.id,
      contact.phone_number,
      recipientStatus,
      sendRes.wamid || null,
      errorMsg,
      isSuccess ? new Date().toISOString() : null
    ).run();

    // Ensure conversation exists and record sent message in inbox
    let conv = await c.env.DB.prepare('SELECT id FROM conversations WHERE contact_id = ?').bind(contact.id).first<any>();
    if (!conv) {
      const convId = `cnv_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await c.env.DB.prepare(
        'INSERT INTO conversations (id, contact_id, contact_phone, contact_name, last_message_text, last_message_at, unread_count, status) VALUES (?, ?, ?, ?, ?, ?, 0, "open")'
      ).bind(
        convId,
        contact.id,
        contact.phone_number,
        contact.name,
        `📄 Broadcast: ${template.name}`,
        nowIso
      ).run();
      conv = { id: convId };
    } else {
      await c.env.DB.prepare(
        'UPDATE conversations SET last_message_text = ?, last_message_at = ?, updated_at = ? WHERE id = ?'
      ).bind(`📄 Broadcast: ${template.name}`, nowIso, nowIso, conv.id).run();
    }

    // Insert message into chat history
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await c.env.DB.prepare(
      `INSERT INTO messages (
        id, conversation_id, wamid, direction, type, content, status, raw_payload, created_at
      ) VALUES (?, ?, ?, "outbound", "template", ?, ?, ?, ?)`
    ).bind(
      msgId,
      conv.id,
      sendRes.wamid || null,
      `📄 Template: ${template.name}`,
      recipientStatus,
      JSON.stringify(sendRes.raw || {}),
      nowIso
    ).run();
  }

  // Update broadcast summary
  const completedIso = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE broadcasts SET 
      status = "completed",
      sent_count = ?,
      failed_count = ?,
      completed_at = ?
     WHERE id = ?`
  ).bind(sentSuccessCount, failedCount, completedIso, broadcastId).run();

  // Log activity
  await c.env.DB.prepare(
    'INSERT INTO activity_logs (id, event_type, description, details) VALUES (?, ?, ?, ?)'
  ).bind(
    `log_${Date.now()}`,
    'broadcast_dispatched',
    `Campaign "${payload.name}" dispatched to ${targetContacts.length} recipients`,
    JSON.stringify({ broadcastId, sent: sentSuccessCount, failed: failedCount })
  ).run();

  return c.json({
    success: true,
    broadcast_id: broadcastId,
    total_recipients: targetContacts.length,
    sent_count: sentSuccessCount,
    failed_count: failedCount,
  });
});
