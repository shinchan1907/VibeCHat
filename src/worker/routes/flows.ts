import { Hono } from 'hono';
import { Env, WabaSettings } from '../types';
import { MetaApiService } from '../services/meta-api';

export const flowsRouter = new Hono<{ Bindings: Env }>();

const META_FLOW_CATEGORIES = ['SIGN_UP', 'SIGN_IN', 'APPOINTMENT_BOOKING', 'LEAD_GENERATION', 'CONTACT_US', 'CUSTOMER_SUPPORT', 'SURVEY', 'OTHER'];
const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

async function graphCall(token: string, method: string, path: string, body?: any): Promise<{ status: number; data: any }> {
  const res = await fetch(`${GRAPH_BASE}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

/**
 * Convert a builder-produced flow JSON (v3.1 shape) into the Flow JSON 7.3
 * format Meta currently requires: version bump, the last screen becomes
 * terminal, and Footer "complete" payloads map every form field explicitly.
 */
export function convertFlowJsonTo73(flowJson: any): any {
  const fj = typeof flowJson === 'string' ? JSON.parse(flowJson || '{}') : (flowJson || {});
  const screens = Array.isArray(fj.screens) ? fj.screens : [];
  const outScreens = screens.map((s: any, i: number) => {
    const children = s?.layout?.children || [];
    const fieldNames = children.filter((ch: any) => ch?.name).map((ch: any) => ch.name);
    const newChildren = children.map((ch: any) => {
      if (ch?.type === 'Footer' && ch['on-click-action']?.name === 'complete') {
        const payload: Record<string, string> = {};
        for (const fn of fieldNames) payload[fn] = '${form.' + fn + '}';
        return { ...ch, 'on-click-action': { ...ch['on-click-action'], payload } };
      }
      return ch;
    });
    return {
      id: s?.id || `SCREEN_${i + 1}`,
      title: s?.title || '',
      data: s?.data || {},
      terminal: i === screens.length - 1,
      layout: { type: 'SingleColumnLayout', children: newChildren },
    };
  });
  return { version: '7.3', screens: outScreens };
}

/**
 * Log an outbound flow send into the customer's conversation so the Inbox
 * timeline shows when a flow was sent (alongside templates and replies).
 */
export async function logFlowSendToConversation(db: any, phone: string, flowName: string, wamid: string | null) {
  try {
    let contact: any = await db.prepare('SELECT * FROM contacts WHERE phone_number = ?').bind(phone).first();
    if (!contact) {
      const cid = `cnt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await db.prepare('INSERT INTO contacts (id, phone_number, name, tags, custom_attributes, opt_in_status) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(cid, phone, `User +${phone}`, JSON.stringify([]), JSON.stringify({}), 'opted_in').run();
      contact = { id: cid, name: `User +${phone}` };
    }
    let conv: any = await db.prepare('SELECT * FROM conversations WHERE contact_id = ?').bind(contact.id).first();
    const nowIso = new Date().toISOString();
    const preview = `📋 [Flow Sent]: ${flowName}`;
    if (!conv) {
      const convId = `cnv_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await db.prepare('INSERT INTO conversations (id, contact_id, contact_phone, contact_name, last_message_text, last_message_at, unread_count, status) VALUES (?, ?, ?, ?, ?, ?, 0, "open")')
        .bind(convId, contact.id, phone, contact.name || phone, preview, nowIso).run();
      conv = { id: convId };
    } else {
      await db.prepare('UPDATE conversations SET last_message_text = ?, last_message_at = ?, updated_at = ? WHERE id = ?')
        .bind(preview, nowIso, nowIso, conv.id).run();
    }
    await db.prepare('INSERT INTO messages (id, conversation_id, wamid, direction, type, content, status) VALUES (?, ?, ?, "outbound", "interactive", ?, "sent")')
      .bind(`msg_${Date.now()}_${Math.random().toString(36).substring(7)}`, conv.id, wamid, preview).run();
  } catch (e) {
    console.warn('logFlowSendToConversation failed:', e);
  }
}


/**
 * List all Flows
 */
flowsRouter.get('/', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM flows ORDER BY created_at DESC').all<any>();

  const flows = (rows.results || []).map((f) => ({
    ...f,
    categories: typeof f.categories === 'string' ? JSON.parse(f.categories || '[]') : (f.categories || []),
    flow_json: typeof f.flow_json === 'string' ? JSON.parse(f.flow_json || '{}') : (f.flow_json || {}),
  }));

  return c.json({ success: true, flows });
});

const FIELD_ORDER = ['customer_name', 'name', 'service', 'select_service', 'best_time_to_call'];

function normalizeTs(ts: string): string {
  if (!ts) return ts;
  // D1 CURRENT_TIMESTAMP is UTC 'YYYY-MM-DD HH:MM:SS' — expose as ISO UTC.
  return ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z';
}

async function fetchSubmissions(c: any, flowId?: string) {
  const rows: any = await c.env.DB.prepare(
    `SELECT s.*, COALESCE(s.flow_name, f.name) AS resolved_flow_name
     FROM flow_submissions s LEFT JOIN flows f ON f.id = s.flow_id
     ${flowId ? 'WHERE s.flow_id = ?' : ''}
     ORDER BY s.created_at DESC LIMIT 1000`
  ).bind(...(flowId ? [flowId] : [])).all();
  // Map flow option ids (e.g. "ac") to their display titles ("AC Service/Repair")
  // using each flow's own data-source definitions.
  const flowRows: any = await c.env.DB.prepare('SELECT id, flow_json FROM flows').all();
  const optionMaps = new Map<string, Map<string, Map<string, string>>>();
  for (const fr of flowRows.results || []) {
    try {
      const fj = typeof fr.flow_json === 'string' ? JSON.parse(fr.flow_json || '{}') : fr.flow_json;
      const perField = new Map<string, Map<string, string>>();
      for (const screen of fj?.screens || []) {
        for (const child of screen?.layout?.children || []) {
          if (child?.name && Array.isArray(child['data-source'])) {
            perField.set(child.name, new Map(child['data-source'].map((o: any) => [o.id, o.title])));
          }
        }
      }
      optionMaps.set(fr.id, perField);
    } catch { /* ignore malformed flow json */ }
  }
  const translate = (flowId: string | null, fields: Record<string, any>) => {
    const out: Record<string, any> = { ...fields };
    for (const [k, v] of Object.entries(out)) {
      if (typeof v !== 'string') continue;
      const own = flowId ? optionMaps.get(flowId)?.get(k) : undefined;
      const anyMap = own || [...optionMaps.values()].map((m) => m.get(k)).find(Boolean);
      if (anyMap?.has(v)) out[k] = anyMap.get(v);
    }
    return out;
  };
  return (rows.results || []).map((r: any) => {
    const fields = typeof r.fields_json === 'string' ? JSON.parse(r.fields_json || '{}') : (r.fields_json || {});
    return {
      id: r.id,
      flow_id: r.flow_id,
      flow_name: r.resolved_flow_name || 'WhatsApp Flow',
      phone_number: r.phone_number,
      fields: translate(r.flow_id, fields),
      created_at: normalizeTs(r.created_at),
    };
  });
}

/**
 * List structured Flow submissions (Submissions tab)
 */
flowsRouter.get('/submissions', async (c) => {
  const submissions = await fetchSubmissions(c, c.req.query('flow_id') || undefined);
  return c.json({ success: true, submissions });
});

/**
 * Export Flow submissions as CSV (opens directly in Excel).
 * Optional ?flow_id= exports just one flow's submissions.
 */
flowsRouter.get('/submissions/export', async (c) => {
  const flowId = c.req.query('flow_id') || undefined;
  const submissions = await fetchSubmissions(c, flowId);
  const extraKeys: string[] = [];
  for (const s of submissions) {
    for (const k of Object.keys(s.fields || {})) {
      if (!extraKeys.includes(k)) extraKeys.push(k);
    }
  }
  extraKeys.sort((a, b) => {
    const ia = FIELD_ORDER.indexOf(a); const ib = FIELD_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const esc = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['Submitted At (UTC)', 'Phone Number', 'Flow', ...extraKeys];
  const lines = [header.join(',')];
  for (const s of submissions) {
    lines.push([s.created_at, s.phone_number, s.flow_name, ...extraKeys.map((k) => (s.fields || {})[k])].map(esc).join(','));
  }
  const csv = '﻿' + lines.join('\r\n');
  const filename = flowId ? `flow-submissions-${flowId}.csv` : 'flow-submissions.csv';
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});

/**
 * Get single Flow by ID
 */
flowsRouter.get('/:id', async (c) => {
  const flowId = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM flows WHERE id = ?').bind(flowId).first<any>();

  if (!row) {
    return c.json({ success: false, error: 'Flow not found' }, 404);
  }

  return c.json({
    success: true,
    flow: {
      ...row,
      categories: typeof row.categories === 'string' ? JSON.parse(row.categories || '[]') : (row.categories || []),
      flow_json: typeof row.flow_json === 'string' ? JSON.parse(row.flow_json || '{}') : (row.flow_json || {}),
    },
  });
});

/**
 * Create or save a new Flow
 */
flowsRouter.post('/', async (c) => {
  const payload = await c.req.json<{
    name: string;
    categories?: string[];
    flow_json: any;
    endpoint_uri?: string;
  }>();

  if (!payload.name || !payload.flow_json) {
    return c.json({ success: false, error: 'Flow name and flow JSON definition are required' }, 400);
  }

  const settings = await c.env.DB.prepare('SELECT * FROM waba_settings WHERE id = "default"').first<any>();
  if (!settings?.access_token || !settings?.waba_id) {
    return c.json({ success: false, error: 'WABA is not configured — connect WhatsApp in Settings before creating flows.' }, 400);
  }

  // Create the flow on Meta for real (previously this only wrote a local row
  // with a fake id, so sends always failed). Convert builder JSON to 7.3.
  const categories = (payload.categories || []).filter((cat: string) => META_FLOW_CATEGORIES.includes(cat));
  const finalCategories = categories.length > 0 ? categories : ['LEAD_GENERATION'];
  const flowJson73 = convertFlowJsonTo73(payload.flow_json);
  const flowJsonStr = JSON.stringify(flowJson73);

  const created = await graphCall(settings.access_token, 'POST', `${settings.waba_id}/flows`, {
    name: payload.name,
    categories: finalCategories,
    flow_json: flowJsonStr,
    publish: false,
  });
  if (!created.data?.id) {
    return c.json({ success: false, error: created.data?.error?.message || 'Meta rejected the flow. Check the flow design and try again.' }, 400);
  }
  const metaFlowId = created.data.id;

  const published = await graphCall(settings.access_token, 'POST', `${metaFlowId}/publish`, {});
  if (published.status !== 200) {
    // Leave no orphan: best-effort delete the unpublished Meta draft.
    await graphCall(settings.access_token, 'DELETE', `${metaFlowId}`).catch(() => null);
    return c.json({ success: false, error: published.data?.error?.message || 'Meta could not publish the flow.' }, 400);
  }

  const nowIso = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO flows (id, name, categories, status, flow_json, endpoint_uri, synced_at, created_at)
     VALUES (?, ?, ?, "PUBLISHED", ?, ?, ?, ?)`
  ).bind(
    metaFlowId,
    payload.name,
    JSON.stringify(finalCategories),
    flowJsonStr,
    '',
    nowIso,
    nowIso
  ).run();

  return c.json({
    success: true,
    flow: {
      id: metaFlowId,
      name: payload.name,
      categories: finalCategories,
      status: 'PUBLISHED',
      flow_json: flowJson73,
    },
  });
});

/**
 * Delete a Flow — removes it on Meta (hard delete for drafts; published
 * flows are deprecated, which is all Meta allows) and locally. Submissions
 * already collected are kept (they carry the flow name).
 */
flowsRouter.delete('/:id', async (c) => {
  const flowId = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM flows WHERE id = ?').bind(flowId).first<any>();
  if (!row) {
    return c.json({ success: false, error: 'Flow not found' }, 404);
  }

  let metaNote = 'local record only';
  const settings = await c.env.DB.prepare('SELECT * FROM waba_settings WHERE id = "default"').first<any>();
  const isMetaId = /^\d+$/.test(flowId);
  if (settings?.access_token && isMetaId) {
    const del = await graphCall(settings.access_token, 'DELETE', `${flowId}`);
    if (del.status === 200) {
      metaNote = 'deleted on Meta';
    } else {
      const dep = await graphCall(settings.access_token, 'POST', `${flowId}/deprecate`, {});
      if (dep.status === 200) {
        metaNote = 'deprecated on Meta (published flows cannot be hard-deleted)';
      } else {
        const upd = await graphCall(settings.access_token, 'POST', `${flowId}`, { status: 'DEPRECATED' });
        metaNote = upd.status === 200
          ? 'deprecated on Meta (published flows cannot be hard-deleted)'
          : 'removed locally; Meta-side removal was refused';
      }
    }
  }

  await c.env.DB.prepare('DELETE FROM flows WHERE id = ?').bind(flowId).run();
  return c.json({ success: true, meta: metaNote });
});

/**
 * Update an existing Flow
 */
flowsRouter.put('/:id', async (c) => {
  const flowId = c.req.param('id');
  const payload = await c.req.json<{
    name?: string;
    categories?: string[];
    flow_json?: any;
    status?: 'DRAFT' | 'PUBLISHED' | 'DEPRECATED';
    endpoint_uri?: string;
  }>();

  const updates: string[] = [];
  const params: any[] = [];

  if (payload.name) {
    updates.push('name = ?');
    params.push(payload.name);
  }
  if (payload.categories) {
    updates.push('categories = ?');
    params.push(JSON.stringify(payload.categories));
  }
  if (payload.flow_json) {
    updates.push('flow_json = ?');
    params.push(typeof payload.flow_json === 'string' ? payload.flow_json : JSON.stringify(payload.flow_json));
  }
  if (payload.status) {
    updates.push('status = ?');
    params.push(payload.status);
  }
  if (payload.endpoint_uri) {
    updates.push('endpoint_uri = ?');
    params.push(payload.endpoint_uri);
  }

  if (updates.length > 0) {
    params.push(flowId);
    await c.env.DB.prepare(`UPDATE flows SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
  }

  return c.json({ success: true });
});

/**
 * Send interactive Flow to a customer in chat
 */
flowsRouter.post('/:id/send', async (c) => {
  const flowId = c.req.param('id');
  const { phone_number, header_text, body_text, call_to_action } = await c.req.json<{
    phone_number: string;
    header_text?: string;
    body_text?: string;
    call_to_action?: string;
  }>();

  if (!phone_number) {
    return c.json({ success: false, error: 'Phone number is required' }, 400);
  }

  const flow = await c.env.DB.prepare('SELECT * FROM flows WHERE id = ?').bind(flowId).first<any>();
  if (!flow) {
    return c.json({ success: false, error: 'Flow not found' }, 404);
  }

  const settings = await c.env.DB.prepare('SELECT * FROM waba_settings WHERE id = "default"').first<WabaSettings>();
  const metaApi = new MetaApiService(settings || { id: 'default' });

  // Navigate to the flow's actual first screen (was hard-coded to a screen
  // that only existed in the old demo flows).
  let firstScreen = 'SURVEY_SCREEN';
  try {
    const fj = typeof flow.flow_json === 'string' ? JSON.parse(flow.flow_json || '{}') : flow.flow_json;
    if (fj?.screens?.[0]?.id) firstScreen = fj.screens[0].id;
  } catch { /* keep fallback */ }

  // Format interactive flow message according to Meta specification
  const interactivePayload = {
    type: 'flow',
    header: header_text ? { type: 'text', text: header_text } : undefined,
    body: { text: body_text || `Please complete our ${flow.name}` },
    footer: { text: 'ByteNex Interactive Form' },
    action: {
      name: 'flow',
      parameters: {
        flow_message_version: '3',
        // Encode the flow id in the token so the webhook can attribute the
        // submission to this flow (parsed back in the nfm_reply handler).
        flow_token: `ft_${flow.id}`,
        flow_id: flow.id,
        flow_cta: call_to_action || 'Open Form',
        flow_action: 'navigate',
        flow_action_payload: {
          screen: firstScreen,
        },
      },
    },
  };

  const res = await metaApi.sendMessage({
    to: phone_number,
    type: 'interactive',
    interactive: interactivePayload,
  });

  // Show the send in the customer's chat timeline
  if (res.success) {
    await logFlowSendToConversation(c.env.DB, phone_number, flow.name, res.wamid || null);
  }

  return c.json({ success: res.success, result: res });
});

/**
 * Meta Flow Data Exchange Webhook Endpoint (/api/flows/endpoint)
 * Called by Meta WhatsApp client when user interacts with Flow screens
 */
flowsRouter.post('/endpoint', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}));
  const action = body.action || 'INIT';

  console.log(`📋 Flow Endpoint Action Received: ${action}`);

  // Flow Response format required by Meta Flow API
  if (action === 'INIT') {
    return c.json({
      version: '3.1',
      screen: 'SURVEY_SCREEN',
      data: {
        company: 'ByteNex',
      },
    });
  }

  if (action === 'data_exchange') {
    return c.json({
      version: '3.1',
      screen: 'SUCCESS_SCREEN',
      data: {
        extension_message_response: {
          params: {
            flow_token: body.flow_token,
            status: 'completed',
          },
        },
      },
    });
  }

  return c.json({ version: '3.1', status: 'OK' });
});
