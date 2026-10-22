import { Hono } from 'hono';
import { Env, WabaSettings } from '../types';
import { MetaApiService } from '../services/meta-api';

export const flowsRouter = new Hono<{ Bindings: Env }>();

/**
 * Standard WhatsApp Flow Templates
 */
const DEFAULT_FLOW_TEMPLATES = [
  {
    name: 'Customer Feedback Survey',
    categories: ['CUSTOMER_SUPPORT', 'SURVEY'],
    flow_json: {
      version: '3.1',
      screens: [
        {
          id: 'SURVEY_SCREEN',
          title: 'ByteNex Feedback',
          data: {},
          terminal: false,
          layout: {
            type: 'SingleColumnLayout',
            children: [
              {
                type: 'TextHeading',
                text: 'How was your experience?',
              },
              {
                type: 'TextSubheading',
                text: 'Your feedback helps us deliver better services.',
              },
              {
                type: 'Dropdown',
                name: 'satisfaction',
                label: 'Overall Satisfaction',
                required: true,
                'data-source': [
                  { id: '5', title: '⭐⭐⭐⭐⭐ Excellent' },
                  { id: '4', title: '⭐⭐⭐⭐ Very Good' },
                  { id: '3', title: '⭐⭐⭐ Average' },
                  { id: '2', title: '⭐⭐ Needs Improvement' },
                  { id: '1', title: '⭐ Poor' },
                ],
              },
              {
                type: 'TextArea',
                name: 'comments',
                label: 'Any additional comments or suggestions?',
                required: false,
              },
              {
                type: 'Footer',
                label: 'Submit Feedback',
                'on-click-action': {
                  name: 'complete',
                  payload: {
                    rating: '${form.satisfaction}',
                    comment: '${form.comments}',
                  },
                },
              },
            ],
          },
        },
      ],
    },
  },
  {
    name: 'Lead Qualification & Consultation',
    categories: ['LEAD_GENERATION', 'APPOINTMENT_BOOKING'],
    flow_json: {
      version: '3.1',
      screens: [
        {
          id: 'LEAD_SCREEN',
          title: 'Schedule a Consultation',
          data: {},
          terminal: false,
          layout: {
            type: 'SingleColumnLayout',
            children: [
              {
                type: 'TextHeading',
                text: 'Tell us about your project',
              },
              {
                type: 'TextInput',
                name: 'company_name',
                label: 'Company or Business Name',
                required: true,
              },
              {
                type: 'Dropdown',
                name: 'service_interest',
                label: 'Service of Interest',
                required: true,
                'data-source': [
                  { id: 'waba_api', title: 'WhatsApp Business API' },
                  { id: 'automation', title: 'Workflow Automation' },
                  { id: 'custom_dev', title: 'Cloudflare / Custom Software' },
                ],
              },
              {
                type: 'Footer',
                label: 'Request Consultation',
                'on-click-action': {
                  name: 'complete',
                  payload: {
                    company: '${form.company_name}',
                    interest: '${form.service_interest}',
                  },
                },
              },
            ],
          },
        },
      ],
    },
  },
];

/**
 * List all Flows
 */
flowsRouter.get('/', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM flows ORDER BY created_at DESC').all<any>();

  let flows = (rows.results || []).map((f) => ({
    ...f,
    categories: typeof f.categories === 'string' ? JSON.parse(f.categories || '[]') : (f.categories || []),
    flow_json: typeof f.flow_json === 'string' ? JSON.parse(f.flow_json || '{}') : (f.flow_json || {}),
  }));

  // If no flows exist yet, seed the default templates so the user immediately has working flows!
  if (flows.length === 0) {
    const seeded = [];
    for (const def of DEFAULT_FLOW_TEMPLATES) {
      const flowId = `flow_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const nowIso = new Date().toISOString();
      await c.env.DB.prepare(
        'INSERT INTO flows (id, name, categories, status, flow_json, synced_at) VALUES (?, ?, ?, "PUBLISHED", ?, ?)'
      ).bind(
        flowId,
        def.name,
        JSON.stringify(def.categories),
        JSON.stringify(def.flow_json),
        nowIso
      ).run();

      seeded.push({
        id: flowId,
        name: def.name,
        categories: def.categories,
        status: 'PUBLISHED',
        flow_json: def.flow_json,
        synced_at: nowIso,
        created_at: nowIso,
      });
    }
    flows = seeded;
  }

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
          screen: 'SURVEY_SCREEN',
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
