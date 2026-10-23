import { Hono } from 'hono';
import { Env, WabaSettings } from '../types';
import { MetaApiService } from '../services/meta-api';

export const flowsRouter = new Hono<{ Bindings: Env }>();

/**
 * Standard WhatsApp Flow Templates
 */


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

async function fetchSubmissions(c: any) {
  const rows: any = await c.env.DB.prepare(
    `SELECT s.*, COALESCE(s.flow_name, f.name) AS resolved_flow_name
     FROM flow_submissions s LEFT JOIN flows f ON f.id = s.flow_id
     ORDER BY s.created_at DESC LIMIT 1000`
  ).all();
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
  const submissions = await fetchSubmissions(c);
  return c.json({ success: true, submissions });
});

/**
 * Export Flow submissions as CSV (opens directly in Excel)
 */
flowsRouter.get('/submissions/export', async (c) => {
  const submissions = await fetchSubmissions(c);
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
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="flow-submissions.csv"',
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

  const flowId = `flow_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const nowIso = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO flows (id, name, categories, status, flow_json, endpoint_uri, synced_at, created_at)
     VALUES (?, ?, ?, "PUBLISHED", ?, ?, ?, ?)`
  ).bind(
    flowId,
    payload.name,
    JSON.stringify(payload.categories || ['OTHER']),
    typeof payload.flow_json === 'string' ? payload.flow_json : JSON.stringify(payload.flow_json),
    payload.endpoint_uri || '/api/flows/endpoint',
    nowIso,
    nowIso
  ).run();

  return c.json({
    success: true,
    flow: {
      id: flowId,
      name: payload.name,
      categories: payload.categories || ['OTHER'],
      status: 'PUBLISHED',
      flow_json: payload.flow_json,
    },
  });
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
