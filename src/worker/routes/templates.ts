import { Hono } from 'hono';
import { Env, WabaSettings } from '../types';
import { MetaApiService } from '../services/meta-api';

export const templatesRouter = new Hono<{ Bindings: Env }>();

/**
 * List templates
 */
templatesRouter.get('/', async (c) => {
  const status = c.req.query('status'); // 'APPROVED', 'PENDING', 'REJECTED'
  const category = c.req.query('category');
  const search = c.req.query('q')?.toLowerCase();

  let sql = 'SELECT * FROM templates WHERE 1=1';
  const params: any[] = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (search) {
    sql += ' AND (LOWER(name) LIKE ? OR LOWER(body_text) LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY created_at DESC';

  const rows = await c.env.DB.prepare(sql).bind(...params).all<any>();
  const templates = (rows.results || []).map((t) => ({
    ...t,
    buttons_json: typeof t.buttons_json === 'string' ? JSON.parse(t.buttons_json || '[]') : (t.buttons_json || []),
  }));

  return c.json({ success: true, templates });
});

/**
 * Sync templates from Meta Graph API
 */
/**
 * Upload a sample media file for a media-header template.
 * Uses Meta's Resumable Upload API and returns the header_handle that the
 * create-template call must include as example.header_handle.
 */
const FALLBACK_META_APP_ID = '1138477858311475'; // Bytenex_wa_app
const MAX_HEADER_SAMPLE_BYTES = 16 * 1024 * 1024;

templatesRouter.post('/header-example', async (c) => {
  const settings = await c.env.DB.prepare('SELECT * FROM waba_settings WHERE id = "default"').first<any>();
  if (!settings?.access_token) {
    return c.json({ success: false, error: 'WABA is not configured yet' }, 400);
  }
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') {
    return c.json({ success: false, error: 'No file uploaded' }, 400);
  }
  if (file.size > MAX_HEADER_SAMPLE_BYTES) {
    return c.json({ success: false, error: 'Sample file must be 16MB or smaller' }, 400);
  }
  const appId = settings.app_id || FALLBACK_META_APP_ID;
  const token = settings.access_token;
  const bytes = await file.arrayBuffer();

  // 1. Create an upload session
  const sessionUrl = `https://graph.facebook.com/v21.0/${appId}/uploads?` + new URLSearchParams({
    file_name: file.name || 'header-sample',
    file_length: String(file.size),
    file_type: file.type || 'application/octet-stream',
  }).toString();
  const sessionRes = await fetch(sessionUrl, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  const sessionData: any = await sessionRes.json().catch(() => ({}));
  if (!sessionRes.ok || !sessionData.id) {
    return c.json({ success: false, error: sessionData?.error?.message || 'Could not start Meta upload session' }, 502);
  }

  // 2. Upload the bytes to the session
  const uploadRes = await fetch(`https://graph.facebook.com/v21.0/${sessionData.id}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      file_offset: '0',
      'Content-Type': 'application/octet-stream',
    },
    body: bytes,
  });
  const uploadData: any = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok || !uploadData.h) {
    return c.json({ success: false, error: uploadData?.error?.message || 'Meta sample upload failed' }, 502);
  }

  return c.json({ success: true, header_handle: uploadData.h, filename: file.name });
});

templatesRouter.post('/sync', async (c) => {
  const settings = await c.env.DB.prepare('SELECT * FROM waba_settings WHERE id = "default"').first<WabaSettings>();
  const metaApi = new MetaApiService(settings || { id: 'default' });

  const res = await metaApi.getTemplates();
  if (!res.success || !res.templates) {
    // If Meta API credentials aren't configured yet, provide useful response
    return c.json({
      success: false,
      error: res.error || 'Failed to sync templates from Meta Graph API. Please ensure your WABA ID and Token are configured in Settings.',
    }, 400);
  }

  let syncedCount = 0;
  const nowIso = new Date().toISOString();

  for (const metaTpl of res.templates) {
    const id = metaTpl.id || `meta_tpl_${metaTpl.name}`;
    const name = metaTpl.name;
    const language = metaTpl.language || 'en_US';
    const category = metaTpl.category || 'UTILITY';
    const status = metaTpl.status || 'APPROVED';

    let headerType = 'NONE';
    let headerContent = '';
    let bodyText = '';
    let footerText = '';
    const buttons: any[] = [];

    const components = metaTpl.components || [];
    for (const comp of components) {
      if (comp.type === 'HEADER') {
        headerType = comp.format || 'TEXT';
        headerContent = comp.text || '';
      } else if (comp.type === 'BODY') {
        bodyText = comp.text || '';
      } else if (comp.type === 'FOOTER') {
        footerText = comp.text || '';
      } else if (comp.type === 'BUTTONS') {
        buttons.push(...(comp.buttons || []));
      }
    }

    await c.env.DB.prepare(
      `INSERT INTO templates (
        id, name, language, category, status, 
        header_type, header_content, body_text, footer_text, 
        buttons_json, meta_raw, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        header_type = excluded.header_type,
        header_content = excluded.header_content,
        body_text = excluded.body_text,
        footer_text = excluded.footer_text,
        buttons_json = excluded.buttons_json,
        meta_raw = excluded.meta_raw,
        synced_at = excluded.synced_at`
    ).bind(
      id,
      name,
      language,
      category,
      status,
      headerType,
      headerContent,
      bodyText,
      footerText,
      JSON.stringify(buttons),
      JSON.stringify(metaTpl),
      nowIso
    ).run();

    syncedCount++;
  }

  // Log activity
  await c.env.DB.prepare(
    'INSERT INTO activity_logs (id, event_type, description, details) VALUES (?, ?, ?, ?)'
  ).bind(
    `log_${Date.now()}`,
    'templates_synced',
    `Synced ${syncedCount} template(s) from Meta Graph API`,
    JSON.stringify({ count: syncedCount })
  ).run();

  return c.json({ success: true, count: syncedCount });
});

/**
 * Create a new WhatsApp Template
 */
templatesRouter.post('/', async (c) => {
  const payload = await c.req.json<{
    name: string;
    category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
    language: string;
    header_type?: 'NONE' | 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO';
    header_content?: string;
    header_example_handle?: string;
    header_example_text?: string;
    body_text: string;
    footer_text?: string;
    buttons?: any[];
    sample_variables?: string[];
  }>();

  if (!payload.name || !payload.body_text || !payload.category) {
    return c.json({ success: false, error: 'Name, Category, and Body text are required' }, 400);
  }

  // Format template name according to Meta rules: lowercase and underscores only
  const cleanName = payload.name.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');

  // Build Meta components array
  const components: any[] = [];

  if (payload.header_type && payload.header_type !== 'NONE') {
    if (payload.header_type === 'TEXT') {
      const headerComp: any = {
        type: 'HEADER',
        format: 'TEXT',
        text: payload.header_content || '',
      };
      // Meta requires a sample value when the header text uses {{1}}
      if ((payload.header_content || '').includes('{{1}}')) {
        headerComp.example = { header_text: [payload.header_example_text || 'Sample'] };
      }
      components.push(headerComp);
    } else {
      // Meta rejects media-header templates without a sample media handle
      // (obtained from POST /templates/header-example via resumable upload).
      if (!payload.header_example_handle) {
        return c.json({ success: false, error: 'Media header templates need a sample file. Upload one in the Header section first.' }, 400);
      }
      components.push({
        type: 'HEADER',
        format: payload.header_type,
        example: { header_handle: [payload.header_example_handle] },
      });
    }
  }

  // Parse variables in body (e.g. {{1}}, {{2}})
  const varMatches = payload.body_text.match(/{{\d+}}/g) || [];
  const bodyComponent: any = {
    type: 'BODY',
    text: payload.body_text,
  };

  if (varMatches.length > 0) {
    const samples = (payload.sample_variables && payload.sample_variables.length >= varMatches.length)
      ? payload.sample_variables
      : varMatches.map((_, i) => `SampleVal${i + 1}`);
    bodyComponent.example = {
      body_text: [samples],
    };
  }
  components.push(bodyComponent);

  if (payload.footer_text && payload.footer_text.trim()) {
    components.push({
      type: 'FOOTER',
      text: payload.footer_text.trim(),
    });
  }

  if (payload.buttons && payload.buttons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: payload.buttons,
    });
  }

  // Submit to Meta
  const settings = await c.env.DB.prepare('SELECT * FROM waba_settings WHERE id = "default"').first<WabaSettings>();
  const metaApi = new MetaApiService(settings || { id: 'default' });

  const metaResult = await metaApi.createTemplate({
    name: cleanName,
    category: payload.category,
    language: payload.language || 'en_US',
    components,
  });

  const templateId = metaResult.id || `local_tpl_${Date.now()}`;
  const initialStatus = metaResult.success ? 'PENDING' : 'APPROVED'; // default to approved for mock/sandbox if offline
  const nowIso = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO templates (
      id, name, language, category, status, 
      header_type, header_content, body_text, footer_text, 
      buttons_json, meta_raw, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    templateId,
    cleanName,
    payload.language || 'en_US',
    payload.category,
    initialStatus,
    payload.header_type || 'NONE',
    payload.header_content || '',
    payload.body_text,
    payload.footer_text || '',
    JSON.stringify(payload.buttons || []),
    JSON.stringify(metaResult.raw || {}),
    nowIso
  ).run();

  return c.json({
    success: true,
    template: {
      id: templateId,
      name: cleanName,
      status: initialStatus,
      category: payload.category,
    },
    metaResponse: metaResult,
  });
});

/**
 * Delete a template
 */
templatesRouter.delete('/:id', async (c) => {
  const templateId = c.req.param('id');
  const tpl = await c.env.DB.prepare('SELECT * FROM templates WHERE id = ?').bind(templateId).first<any>();

  if (tpl) {
    const settings = await c.env.DB.prepare('SELECT * FROM waba_settings WHERE id = "default"').first<WabaSettings>();
    const metaApi = new MetaApiService(settings || { id: 'default' });
    await metaApi.deleteTemplate(tpl.name).catch(() => {});

    await c.env.DB.prepare('DELETE FROM templates WHERE id = ?').bind(templateId).run();
  }

  return c.json({ success: true });
});
