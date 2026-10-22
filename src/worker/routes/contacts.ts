import { Hono } from 'hono';
import { Env } from '../types';

export const contactsRouter = new Hono<{ Bindings: Env }>();

/**
 * List contacts with search and tag filtering
 */
contactsRouter.get('/', async (c) => {
  const query = c.req.query('q')?.toLowerCase() || '';
  const tag = c.req.query('tag');
  const optIn = c.req.query('opt_in'); // 'opted_in', 'opted_out'

  let sql = 'SELECT * FROM contacts WHERE 1=1';
  const params: any[] = [];

  if (query) {
    sql += ' AND (LOWER(name) LIKE ? OR phone_number LIKE ? OR LOWER(email) LIKE ?)';
    const p = `%${query}%`;
    params.push(p, p, p);
  }

  if (optIn) {
    sql += ' AND opt_in_status = ?';
    params.push(optIn);
  }

  sql += ' ORDER BY created_at DESC LIMIT 300';

  const rows = await c.env.DB.prepare(sql).bind(...params).all<any>();

  let contacts = (rows.results || []).map((ct) => ({
    ...ct,
    tags: typeof ct.tags === 'string' ? JSON.parse(ct.tags || '[]') : (ct.tags || []),
    custom_attributes: typeof ct.custom_attributes === 'string' ? JSON.parse(ct.custom_attributes || '{}') : (ct.custom_attributes || {}),
  }));

  if (tag) {
    contacts = contacts.filter((ct) => ct.tags.includes(tag));
  }

  return c.json({ success: true, contacts });
});

/**
 * Get distinct tags
 */
contactsRouter.get('/tags', async (c) => {
  const rows = await c.env.DB.prepare('SELECT tags FROM contacts').all<any>();
  const tagSet = new Set<string>();

  for (const r of rows.results || []) {
    try {
      const parsed = typeof r.tags === 'string' ? JSON.parse(r.tags || '[]') : (r.tags || []);
      for (const t of parsed) tagSet.add(t);
    } catch {}
  }

  return c.json({ success: true, tags: Array.from(tagSet) });
});

/**
 * Create or update contact
 */
contactsRouter.post('/', async (c) => {
  const payload = await c.req.json<{
    id?: string;
    phone_number: string;
    name?: string;
    email?: string;
    tags?: string[];
    notes?: string;
    opt_in_status?: 'opted_in' | 'opted_out';
  }>();

  if (!payload.phone_number) {
    return c.json({ success: false, error: 'Phone number is required' }, 400);
  }

  const cleanPhone = payload.phone_number.replace(/\D/g, '');
  const nowIso = new Date().toISOString();

  if (payload.id) {
    // Update existing contact
    await c.env.DB.prepare(
      `UPDATE contacts SET 
        name = ?, email = ?, tags = ?, notes = ?, 
        opt_in_status = COALESCE(?, opt_in_status), updated_at = ?
       WHERE id = ?`
    ).bind(
      payload.name || null,
      payload.email || null,
      JSON.stringify(payload.tags || []),
      payload.notes || null,
      payload.opt_in_status || null,
      nowIso,
      payload.id
    ).run();

    return c.json({ success: true, id: payload.id });
  }

  // Create new contact
  const contactId = `cnt_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  await c.env.DB.prepare(
    `INSERT INTO contacts (id, phone_number, name, email, tags, notes, opt_in_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(phone_number) DO UPDATE SET
       name = COALESCE(excluded.name, contacts.name),
       email = COALESCE(excluded.email, contacts.email),
       tags = excluded.tags,
       notes = COALESCE(excluded.notes, contacts.notes),
       opt_in_status = excluded.opt_in_status,
       updated_at = excluded.updated_at`
  ).bind(
    contactId,
    cleanPhone,
    payload.name || `+${cleanPhone}`,
    payload.email || null,
    JSON.stringify(payload.tags || []),
    payload.notes || null,
    payload.opt_in_status || 'opted_in',
    nowIso,
    nowIso
  ).run();

  return c.json({ success: true, id: contactId });
});

/**
 * Bulk Import contacts (CSV / JSON)
 */
contactsRouter.post('/import', async (c) => {
  const { contacts: importList, default_tags } = await c.req.json<{
    contacts: Array<{ phone_number: string; name?: string; email?: string; tags?: string[] }>;
    default_tags?: string[];
  }>();

  if (!Array.isArray(importList) || importList.length === 0) {
    return c.json({ success: false, error: 'Contacts list is required' }, 400);
  }

  let imported = 0;
  const nowIso = new Date().toISOString();

  for (const item of importList) {
    if (!item.phone_number) continue;
    const cleanPhone = item.phone_number.replace(/\D/g, '');
    if (cleanPhone.length < 7) continue;

    const contactId = `cnt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const mergedTags = Array.from(new Set([...(item.tags || []), ...(default_tags || ['Imported'])]));

    await c.env.DB.prepare(
      `INSERT INTO contacts (id, phone_number, name, email, tags, opt_in_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, "opted_in", ?, ?)
       ON CONFLICT(phone_number) DO UPDATE SET
         name = COALESCE(excluded.name, contacts.name),
         email = COALESCE(excluded.email, contacts.email),
         updated_at = excluded.updated_at`
    ).bind(
      contactId,
      cleanPhone,
      item.name || `+${cleanPhone}`,
      item.email || null,
      JSON.stringify(mergedTags),
      nowIso,
      nowIso
    ).run();

    imported++;
  }

  return c.json({ success: true, count: imported });
});

/**
 * Delete contact
 */
contactsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM contacts WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});
