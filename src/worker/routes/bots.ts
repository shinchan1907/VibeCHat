import { Hono } from 'hono';
import { Env } from '../types';

export const botsRouter = new Hono<{ Bindings: Env }>();



/**
 * List all Chatbot workflows
 */
botsRouter.get('/', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT * FROM chatbot_flows ORDER BY created_at DESC'
  ).all<any>();

  const bots = (rows.results || []).map((b) => ({
    ...b,
    trigger_keywords: typeof b.trigger_keywords === 'string' ? JSON.parse(b.trigger_keywords || '[]') : (b.trigger_keywords || []),
    nodes: typeof b.nodes_json === 'string' ? JSON.parse(b.nodes_json || '[]') : (b.nodes_json || []),
  }));

  return c.json({ success: true, bots });
});

/**
 * Save / Update a Chatbot workflow
 */
botsRouter.post('/', async (c) => {
  const payload = await c.req.json<{
    id?: string;
    name: string;
    description?: string;
    trigger_type: string;
    trigger_keywords: string[];
    nodes: any[];
  }>();

  if (!payload.name || !payload.nodes) {
    return c.json({ success: false, error: 'Bot name and nodes definition are required' }, 400);
  }

  const nowIso = new Date().toISOString();
  const id = payload.id || `bot_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  await c.env.DB.prepare(
    `INSERT INTO chatbot_flows (id, name, description, trigger_type, trigger_keywords, nodes_json, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       description = excluded.description,
       trigger_type = excluded.trigger_type,
       trigger_keywords = excluded.trigger_keywords,
       nodes_json = excluded.nodes_json,
       updated_at = excluded.updated_at`
  ).bind(
    id,
    payload.name,
    payload.description || '',
    payload.trigger_type || 'keyword',
    JSON.stringify(payload.trigger_keywords || []),
    JSON.stringify(payload.nodes || []),
    nowIso,
    nowIso
  ).run();

  return c.json({ success: true, id });
});

/**
 * Toggle Bot active status
 */
botsRouter.post('/:id/toggle', async (c) => {
  const id = c.req.param('id');
  const bot = await c.env.DB.prepare('SELECT is_active FROM chatbot_flows WHERE id = ?').bind(id).first<any>();
  if (!bot) return c.json({ success: false, error: 'Bot not found' }, 404);

  const newStatus = bot.is_active ? 0 : 1;
  await c.env.DB.prepare('UPDATE chatbot_flows SET is_active = ? WHERE id = ?').bind(newStatus, id).run();

  return c.json({ success: true, is_active: newStatus });
});

/**
 * Delete a Bot workflow
 */
botsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM chatbot_flows WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

/**
 * Interactive Simulator / Test-run
 */
botsRouter.post('/simulate', async (c) => {
  const { bot_id, message } = await c.req.json<{ bot_id: string; message: string }>();

  const bot = await c.env.DB.prepare('SELECT * FROM chatbot_flows WHERE id = ?').bind(bot_id).first<any>();
  if (!bot) return c.json({ success: false, error: 'Bot not found' }, 404);

  const nodes = typeof bot.nodes_json === 'string' ? JSON.parse(bot.nodes_json || '[]') : (bot.nodes_json || []);
  const executionPath: any[] = [];
  let replyText = 'Thanks for your message!';
  let replyButtons: string[] = [];

  const lowerMsg = (message || '').toLowerCase();

  // Find trigger node
  const triggerNode = nodes.find((n: any) => n.type === 'trigger');
  if (triggerNode) {
    executionPath.push({ nodeId: triggerNode.id, title: triggerNode.title, status: 'MATCHED' });
  }

  // Find greeting node
  const msgNode = nodes.find((n: any) => n.type === 'message');
  if (msgNode) {
    executionPath.push({ nodeId: msgNode.id, title: msgNode.title, status: 'EXECUTED' });
    replyText = msgNode.config?.text || replyText;
  }

  // Check if/else condition node
  const condNode = nodes.find((n: any) => n.type === 'condition');
  if (condNode) {
    const val = (condNode.config?.value || '').toLowerCase();
    const isTrue = lowerMsg.includes(val);
    executionPath.push({
      nodeId: condNode.id,
      title: condNode.title,
      status: isTrue ? 'BRANCH_TRUE' : 'BRANCH_FALSE',
      details: `Condition "${condNode.config?.field} contains '${val}'" evaluated to ${isTrue}`,
    });

    if (isTrue) {
      const branchTrue = nodes.find((n: any) => n.id === 'node_branch_pricing' || n.title?.includes('TRUE'));
      if (branchTrue) {
        replyText = branchTrue.config?.text || replyText;
        replyButtons = branchTrue.config?.buttons || [];
        executionPath.push({ nodeId: branchTrue.id, title: branchTrue.title, status: 'EXECUTED' });
      }
    } else {
      const branchFalse = nodes.find((n: any) => n.id === 'node_branch_general' || n.title?.includes('FALSE'));
      if (branchFalse) {
        replyText = branchFalse.config?.text || replyText;
        replyButtons = branchFalse.config?.buttons || [];
        executionPath.push({ nodeId: branchFalse.id, title: branchFalse.title, status: 'EXECUTED' });
      }
    }
  }

  return c.json({
    success: true,
    executionPath,
    reply: {
      text: replyText,
      buttons: replyButtons,
    },
  });
});
