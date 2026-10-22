import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './types';
import { authRouter } from './routes/auth';
import { webhookRouter } from './routes/webhook';
import { chatsRouter } from './routes/chats';
import { templatesRouter } from './routes/templates';
import { broadcastsRouter } from './routes/broadcasts';
import { flowsRouter } from './routes/flows';
import { contactsRouter } from './routes/contacts';
import { settingsRouter } from './routes/settings';
import { mediaRouter } from './routes/media';
import { botsRouter } from './routes/bots';

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for frontend development & webhook integration
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check endpoint
app.get('/api/health', (c) => {
  return c.json({
    status: 'healthy',
    platform: 'ByteNex WhatsApp Business Platform',
    target: 'Cloudflare Free Tier (Workers + D1 + R2)',
    timestamp: new Date().toISOString(),
  });
});

// Authentication Guard Middleware
app.use('/api/*', async (c, next) => {
  const path = c.req.path;

  // Public endpoints
  const isPublic = 
    path.startsWith('/api/auth') ||
    path.startsWith('/api/webhook') ||
    path.startsWith('/api/flows/endpoint') ||
    path.startsWith('/api/media/file') ||
    path.startsWith('/api/media/proxy') ||
    path === '/api/health';

  if (isPublic) {
    return next();
  }

  // Validate session token
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Authentication required. Please log in with your email OTP.' }, 401);
  }

  const token = authHeader.replace('Bearer ', '').trim();
  const nowIso = new Date().toISOString();

  const session = await c.env.DB.prepare(
    'SELECT * FROM sessions WHERE token = ? AND expires_at > ?'
  ).bind(token, nowIso).first<any>();

  if (!session) {
    return c.json({ success: false, error: 'Session expired or invalid. Please re-authenticate.' }, 401);
  }

  return next();
});

// Mount modular API routers
app.route('/api/auth', authRouter);
app.route('/api/webhook', webhookRouter);
app.route('/api/chats', chatsRouter);
app.route('/api/templates', templatesRouter);
app.route('/api/broadcasts', broadcastsRouter);
app.route('/api/flows', flowsRouter);
app.route('/api/contacts', contactsRouter);
app.route('/api/settings', settingsRouter);
app.route('/api/media', mediaRouter);
app.route('/api/bots', botsRouter);

// Fallback to Cloudflare Static Assets for SPA
app.all('*', async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('ByteNex WABA API Server (Cloudflare Worker)', 200);
});

export default app;
