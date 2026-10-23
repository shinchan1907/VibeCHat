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
        flow_token: `flow_token_${Date.now()}`,
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
