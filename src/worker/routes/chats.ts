import { Hono } from 'hono';
import { Env, WabaSettings } from '../types';
import { MetaApiService } from '../services/meta-api';

export const chatsRouter = new Hono<{ Bindings: Env }>();

/**
 * Timestamps in D1 exist in two shapes: SQLite CURRENT_TIMESTAMP
 * ('YYYY-MM-DD HH:MM:SS', UTC) written by DB defaults, and JS ISO strings
 * ('...T...Z') written by the worker. Normalise everything to ISO UTC so the
 * browser parses it as UTC (a bare space-format string is parsed as LOCAL
 * time, which shifted displayed times by the timezone offset), and always
 * ORDER BY datetime(...) so the two shapes sort by instant, not by string.
 */
export function normalizeTs(ts: string | null | undefined): string | null {
  if (!ts) return null;
  return ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z';
}

/**
 * List all conversations with 24-hour customer service window status
 */
chatsRouter.get('/', async (c) => {
  const query = c.req.query('q')?.toLowerCase() || '';
  const status = c.req.query('status'); // 'open' | 'resolved' | 'pending' | 'all'

  let sql = `
    SELECT 
      c.id, c.contact_id, c.contact_phone, c.contact_name,
      c.last_message_text, c.last_message_at, c.last_customer_message_at,
      c.unread_count, c.is_pinned, c.status, c.created_at, c.updated_at,
      ct.tags, ct.opt_in_status
    FROM conversations c
    LEFT JOIN contacts ct ON c.contact_id = ct.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (status && status !== 'all') {
    sql += ' AND c.status = ?';
    params.push(status);
  }

  if (query) {
    sql += ' AND (LOWER(c.contact_name) LIKE ? OR c.contact_phone LIKE ? OR LOWER(c.last_message_text) LIKE ?)';
    const searchPattern = `%${query}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  sql += ' ORDER BY c.is_pinned DESC, datetime(c.last_message_at) DESC LIMIT 100';

  const rows = await c.env.DB.prepare(sql).bind(...params).all<any>();
  const now = Date.now();

  const conversations = (rows.results || []).map((conv) => {
    let isWindowOpen = false;
    let windowExpiresAt: string | null = null;
    let windowSecondsRemaining = 0;

    if (conv.last_customer_message_at) {
      const customerMsgTime = new Date(normalizeTs(conv.last_customer_message_at)).getTime();
      const expiresAt = customerMsgTime + 24 * 60 * 60 * 1000;
      if (expiresAt > now) {
        isWindowOpen = true;
        windowExpiresAt = new Date(expiresAt).toISOString();
        windowSecondsRemaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
      }
    }

    return {
      ...conv,
      last_message_at: normalizeTs(conv.last_message_at),
      last_customer_message_at: normalizeTs(conv.last_customer_message_at),
      created_at: normalizeTs(conv.created_at),
      updated_at: normalizeTs(conv.updated_at),
      tags: typeof conv.tags === 'string' ? JSON.parse(conv.tags || '[]') : (conv.tags || []),
      is_window_open: isWindowOpen,
      window_expires_at: windowExpiresAt,
      window_seconds_remaining: windowSecondsRemaining,
    };
  });

  return c.json({ success: true, conversations });
});

/**
 * Get message history for a conversation
 */
chatsRouter.get('/:id/messages', async (c) => {
  const conversationId = c.req.param('id');

  const conv = await c.env.DB.prepare('SELECT * FROM conversations WHERE id = ?').bind(conversationId).first<any>();
  if (!conv) {
    return c.json({ success: false, error: 'Conversation not found' }, 404);
  }

  const messages = await c.env.DB.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY datetime(created_at) ASC LIMIT 300'
  ).bind(conversationId).all<any>();

  return c.json({
    success: true,
    conversation: {
      ...conv,
      last_message_at: normalizeTs(conv.last_message_at),
      last_customer_message_at: normalizeTs(conv.last_customer_message_at),
      created_at: normalizeTs(conv.created_at),
      updated_at: normalizeTs(conv.updated_at),
    },
    messages: (messages.results || []).map((m: any) => ({ ...m, created_at: normalizeTs(m.created_at) })),
  });
});

/**
 * Send an outbound message
 */
chatsRouter.post('/:id/messages', async (c) => {
  const conversationId = c.req.param('id');
  const payload = await c.req.json<{
    type?: 'text' | 'image' | 'document' | 'audio' | 'video' | 'template' | 'interactive';
    text?: string;
    mediaUrl?: string;
    mediaCaption?: string;
    template?: {
      name: string;
      language: { code: string };
      components?: any[];
    };
    interactive?: any;
  }>();

  const conv = await c.env.DB.prepare('SELECT * FROM conversations WHERE id = ?').bind(conversationId).first<any>();
  if (!conv) {
    return c.json({ success: false, error: 'Conversation not found' }, 404);
  }

  // Load WABA settings
  const settings = await c.env.DB.prepare('SELECT * FROM waba_settings WHERE id = "default"').first<WabaSettings>();
  const metaApi = new MetaApiService(settings || { id: 'default' });

  const msgType = payload.type || 'text';

  // Send message via Meta WhatsApp API
  const sendResult = await metaApi.sendMessage({
    to: conv.contact_phone,
    type: msgType,
    text: payload.text,
    mediaUrl: payload.mediaUrl,
    mediaCaption: payload.mediaCaption,
    template: payload.template,
    interactive: payload.interactive,
  });

  if (!sendResult.success) {
    return c.json({
      success: false,
      error: sendResult.error || 'Failed to dispatch message to WhatsApp Cloud API',
    }, 400);
  }

  // Save outbound message to DB
  const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const nowIso = new Date().toISOString();

  let messagePreview = payload.text || '';
  if (msgType === 'template') {
    // Render the actual template content (header, body with variables,
    // footer, buttons) so the chat shows the real message, not just a name.
    const tpl = payload.template?.name
      ? await c.env.DB.prepare('SELECT * FROM templates WHERE name = ?').bind(payload.template.name).first<any>()
      : null;
    if (tpl) {
      const bodyComp = (payload.template?.components || []).find((comp: any) => comp.type === 'body');
      const vars = (bodyComp?.parameters || []).filter((p: any) => p.type === 'text').map((p: any) => p.text);
      const { renderTemplateContent } = await import('../services/template-render');
      messagePreview = renderTemplateContent(tpl, vars, conv.contact_name);
    } else {
      messagePreview = `📄 Template: ${payload.template?.name}`;
    }
  }
  else if (msgType === 'image') messagePreview = payload.mediaCaption ? `📷 ${payload.mediaCaption}` : '📷 Image';
  else if (msgType === 'document') messagePreview = '📎 Document';
  else if (msgType === 'audio') messagePreview = '🎵 Audio';
  else if (msgType === 'video') messagePreview = '🎥 Video';
  else if (msgType === 'interactive') messagePreview = '🔘 Interactive button';

  await c.env.DB.prepare(
    `INSERT INTO messages (
      id, conversation_id, wamid, direction, type, content, 
      media_url, media_caption, status, raw_payload, created_at
    ) VALUES (?, ?, ?, "outbound", ?, ?, ?, ?, "sent", ?, ?)`
  ).bind(
    msgId,
    conversationId,
    sendResult.wamid || null,
    msgType,
    messagePreview,
    payload.mediaUrl || null,
    payload.mediaCaption || null,
    JSON.stringify(sendResult.raw || {}),
    nowIso
  ).run();

  // Update conversation (list preview stays short for templates)
  const listPreview = msgType === 'template' ? `📄 ${payload.template?.name}` : messagePreview;
  await c.env.DB.prepare(
    'UPDATE conversations SET last_message_text = ?, last_message_at = ?, updated_at = ? WHERE id = ?'
  ).bind(listPreview, nowIso, nowIso, conversationId).run();

  const newMessage = {
    id: msgId,
    conversation_id: conversationId,
    wamid: sendResult.wamid,
    direction: 'outbound',
    type: msgType,
    content: messagePreview,
    media_url: payload.mediaUrl,
    media_caption: payload.mediaCaption,
    status: 'sent',
    created_at: nowIso,
  };

  return c.json({ success: true, message: newMessage });
});

/**
 * Mark conversation as read
 */
chatsRouter.post('/:id/read', async (c) => {
  const conversationId = c.req.param('id');

  // Find last inbound message to send read receipt to Meta
  const lastInbound = await c.env.DB.prepare(
    'SELECT wamid FROM messages WHERE conversation_id = ? AND direction = "inbound" AND wamid IS NOT NULL ORDER BY datetime(created_at) DESC LIMIT 1'
  ).bind(conversationId).first<any>();

  if (lastInbound?.wamid) {
    const settings = await c.env.DB.prepare('SELECT * FROM waba_settings WHERE id = "default"').first<WabaSettings>();
    const metaApi = new MetaApiService(settings || { id: 'default' });
    metaApi.markMessageAsRead(lastInbound.wamid).catch(() => {});
  }

  await c.env.DB.prepare(
    'UPDATE conversations SET unread_count = 0 WHERE id = ?'
  ).bind(conversationId).run();

  return c.json({ success: true });
});

/**
 * Update conversation status (open, resolved, pending) or pinned state
 */
chatsRouter.patch('/:id', async (c) => {
  const conversationId = c.req.param('id');
  const { status, is_pinned } = await c.req.json<{ status?: string; is_pinned?: boolean }>();

  let updates: string[] = [];
  let params: any[] = [];

  if (status) {
    updates.push('status = ?');
    params.push(status);
  }
  if (typeof is_pinned === 'boolean') {
    updates.push('is_pinned = ?');
    params.push(is_pinned ? 1 : 0);
  }

  if (updates.length > 0) {
    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(conversationId);

    await c.env.DB.prepare(
      `UPDATE conversations SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run();
  }

  return c.json({ success: true });
});

/**
 * Initiate a new conversation
 */
chatsRouter.post('/start', async (c) => {
  const { phone_number, name, initial_message, template } = await c.req.json<{
    phone_number: string;
    name?: string;
    initial_message?: string;
    template?: any;
  }>();

  if (!phone_number) {
    return c.json({ success: false, error: 'Phone number is required' }, 400);
  }

  const cleanPhone = phone_number.replace(/\D/g, '');

  // Find or create contact
  let contact = await c.env.DB.prepare('SELECT * FROM contacts WHERE phone_number = ?').bind(cleanPhone).first<any>();
  if (!contact) {
    const contactId = `cnt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await c.env.DB.prepare(
      'INSERT INTO contacts (id, phone_number, name, tags, custom_attributes, opt_in_status) VALUES (?, ?, ?, "[]", "{}", "opted_in")'
    ).bind(contactId, cleanPhone, name || `+${cleanPhone}`).run();
    contact = { id: contactId, phone_number: cleanPhone, name: name || `+${cleanPhone}` };
  }

  // Find or create conversation
  let conv = await c.env.DB.prepare('SELECT * FROM conversations WHERE contact_id = ?').bind(contact.id).first<any>();
  const nowIso = new Date().toISOString();

  if (!conv) {
    const convId = `cnv_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await c.env.DB.prepare(
      'INSERT INTO conversations (id, contact_id, contact_phone, contact_name, last_message_text, last_message_at, unread_count, status) VALUES (?, ?, ?, ?, ?, ?, 0, "open")'
    ).bind(
      convId,
      contact.id,
      cleanPhone,
      contact.name,
      initial_message || (template ? `📄 Template: ${template.name}` : 'Started conversation'),
      nowIso
    ).run();
    conv = { id: convId };
  }

  // If initial message or template provided, send it
  if (initial_message || template) {
    const settings = await c.env.DB.prepare('SELECT * FROM waba_settings WHERE id = "default"').first<WabaSettings>();
    const metaApi = new MetaApiService(settings || { id: 'default' });

    const msgType = template ? 'template' : 'text';
    const sendResult = await metaApi.sendMessage({
      to: cleanPhone,
      type: msgType,
      text: initial_message,
      template: template,
    });

    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const preview = template ? `📄 Template: ${template.name}` : initial_message;

    await c.env.DB.prepare(
      `INSERT INTO messages (
        id, conversation_id, wamid, direction, type, content, status, raw_payload, created_at
      ) VALUES (?, ?, ?, "outbound", ?, ?, "sent", ?, ?)`
    ).bind(
      msgId,
      conv.id,
      sendResult.wamid || null,
      msgType,
      preview,
      JSON.stringify(sendResult.raw || {}),
      nowIso
    ).run();
  }

  return c.json({ success: true, conversation_id: conv.id });
});
