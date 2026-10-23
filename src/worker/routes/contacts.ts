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

  // Dedupe by cleaned phone (last entry wins)
  const byPhone = new Map<string, { phone_number: string; name?: string; email?: string; tags?: string[] }>();
  for (const item of importList) {
    if (!item.phone_number) continue;
    const cleanPhone = item.phone_number.replace(/\D/g, '');
    if (cleanPhone.length < 7) continue;
    byPhone.set(cleanPhone, item);
  }
  const items = [...byPhone.entries()];
  if (items.length === 0) {
    return c.json({ success: false, error: 'No valid phone numbers found' }, 400);
  }

  const nowIso = new Date().toISOString();
  const CHUNK = 100;
  let created = 0;
  let updated = 0;

  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    // Fetch existing tags so duplicates merge tags instead of losing them
    const placeholders = chunk.map(() => '?').join(',');
    const existing = await c.env.DB.prepare(
      `SELECT phone_number, tags FROM contacts WHERE phone_number IN (${placeholders})`
    ).bind(...chunk.map(([phone]) => phone)).all<any>();
    const existingTags = new Map<string, string[]>();
    for (const row of existing.results || []) {
      try { existingTags.set(row.phone_number, JSON.parse(row.tags || '[]')); } catch { existingTags.set(row.phone_number, []); }
    }

    const statements = chunk.map(([cleanPhone, item]) => {
      const isExisting = existingTags.has(cleanPhone);
      if (isExisting) updated++; else created++;
      const mergedTags = Array.from(new Set([
        ...(existingTags.get(cleanPhone) || []),
        ...(item.tags || []),
        ...(default_tags || ['Imported']),
      ]));
      return c.env.DB.prepare(
        `INSERT INTO contacts (id, phone_number, name, email, tags, opt_in_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, "opted_in", ?, ?)
         ON CONFLICT(phone_number) DO UPDATE SET
           name = COALESCE(excluded.name, contacts.name),
           email = COALESCE(excluded.email, contacts.email),
           tags = excluded.tags,
           updated_at = excluded.updated_at`
      ).bind(
        `cnt_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        cleanPhone,
        item.name || `+${cleanPhone}`,
        item.email || null,
        JSON.stringify(mergedTags),
        nowIso,
        nowIso
      );
    });

    // One batched round-trip per chunk (the old row-by-row loop timed out on
    // large pastes — rows were written but the response never arrived, so the
    // UI reported "Request failed" for an import that had mostly succeeded).
    await c.env.DB.batch(statements);
  }

  return c.json({ success: true, count: items.length, created, updated });
});

/**
 * Delete contact
 */
contactsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM contacts WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});
