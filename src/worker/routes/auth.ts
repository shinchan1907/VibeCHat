import { Hono } from 'hono';
import { Env, WabaSettings } from '../types';
import { EmailService } from '../services/email';

export const authRouter = new Hono<{ Bindings: Env }>();

const ALLOWED_ADMIN_EMAIL = 'contact@bytenex.io';

/**
 * Request Email OTP
 */
authRouter.post('/send-otp', async (c) => {
  const { email } = await c.req.json<{ email?: string }>();
  const adminEmail = c.env.ADMIN_EMAIL || ALLOWED_ADMIN_EMAIL;

  if (!email || email.trim().toLowerCase() !== adminEmail.toLowerCase()) {
    return c.json(
      { success: false, error: `Unauthorized email address. Only ${adminEmail} is permitted.` },
      403
    );
  }

  // Generate 6-digit random code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const id = `otp_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Store in D1
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await c.env.DB.prepare(
    'INSERT INTO otp_codes (id, email, code, expires_at, used) VALUES (?, ?, ?, ?, 0)'
  ).bind(id, email.toLowerCase(), code, expiresAt).run();

  // Retrieve settings for email dispatch
  const settings = await c.env.DB.prepare('SELECT * FROM waba_settings WHERE id = "default"').first<WabaSettings>();
  const emailService = new EmailService(settings || { id: 'default' }, c.env);
  const result = await emailService.sendOtpEmail(email, code);

  // Log activity
  await c.env.DB.prepare(
    'INSERT INTO activity_logs (id, event_type, description, details) VALUES (?, ?, ?, ?)'
  ).bind(
    `log_${Date.now()}`,
    'auth_otp_requested',
    `OTP generated for ${email}`,
    JSON.stringify({ method: result.method })
  ).run();

  return c.json({
    success: true,
    message: `Verification code sent to ${email}`,
    previewCode: result.previewCode, // Provided for instant seamless test & local dev
  });
});

/**
 * Verify OTP & Issue Session
 */
authRouter.post('/verify-otp', async (c) => {
  const { email, code } = await c.req.json<{ email?: string; code?: string }>();
  const adminEmail = c.env.ADMIN_EMAIL || ALLOWED_ADMIN_EMAIL;

  if (!email || !code) {
    return c.json({ success: false, error: 'Email and verification code are required' }, 400);
  }

  if (email.trim().toLowerCase() !== adminEmail.toLowerCase()) {
    return c.json({ success: false, error: 'Unauthorized email' }, 403);
  }

  const nowIso = new Date().toISOString();
  const record = await c.env.DB.prepare(
    'SELECT * FROM otp_codes WHERE email = ? AND code = ? AND used = 0 AND expires_at > ? ORDER BY created_at DESC LIMIT 1'
  ).bind(email.toLowerCase(), code.trim(), nowIso).first<any>();

  if (!record) {
    return c.json({ success: false, error: 'Invalid or expired verification code' }, 400);
  }

  // Mark OTP as used
  await c.env.DB.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').bind(record.id).run();

  // Create 30-day session
  const token = `sess_${crypto.randomUUID().replace(/-/g, '')}_${Date.now()}`;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await c.env.DB.prepare(
    'INSERT INTO sessions (token, email, expires_at) VALUES (?, ?, ?)'
  ).bind(token, email.toLowerCase(), expiresAt).run();

  // Log activity
  await c.env.DB.prepare(
    'INSERT INTO activity_logs (id, event_type, description, details) VALUES (?, ?, ?, ?)'
  ).bind(
    `log_${Date.now()}`,
    'auth_login_success',
    `Admin session authenticated for ${email}`,
    JSON.stringify({ sessionToken: token.substring(0, 10) + '...' })
  ).run();

  return c.json({
    success: true,
    token,
    user: {
      email: email.toLowerCase(),
      name: 'ByteNex Admin',
      role: 'admin',
    },
  });
});

/**
 * Cloudflare Access (Zero Trust) Inbuilt OTP Session Issuance
 */
authRouter.get('/cf-access', async (c) => {
  const cfEmail = c.req.header('cf-access-authenticated-user-email');
  const cfJwt = c.req.header('cf-access-jwt-assertion');
  const adminEmail = c.env.ADMIN_EMAIL || ALLOWED_ADMIN_EMAIL;

  if (cfEmail && cfEmail.trim().toLowerCase() === adminEmail.toLowerCase()) {
    // Cloudflare Zero Trust Inbuilt OTP has already authenticated this user!
    const token = `sess_cf_${crypto.randomUUID().replace(/-/g, '')}_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await c.env.DB.prepare(
      'INSERT INTO sessions (token, email, expires_at) VALUES (?, ?, ?)'
    ).bind(token, cfEmail.toLowerCase(), expiresAt).run();

    await c.env.DB.prepare(
      'INSERT INTO activity_logs (id, event_type, description, details) VALUES (?, ?, ?, ?)'
    ).bind(
      `log_${Date.now()}`,
      'auth_cloudflare_access_login',
      `Admin authenticated via Cloudflare Access Inbuilt OTP: ${cfEmail}`,
      JSON.stringify({ method: 'cloudflare_zero_trust_otp', hasJwt: Boolean(cfJwt) })
    ).run();

    return c.json({
      success: true,
      token,
      method: 'cloudflare_access_otp',
      user: {
        email: cfEmail.toLowerCase(),
        name: 'ByteNex Admin',
        role: 'admin',
      },
    });
  }

  return c.json({
    success: false,
    error: 'No active Cloudflare Access Zero Trust OTP session detected on this request.',
  }, 401);
});

/**
 * Get Current Session / Me
 */
authRouter.get('/me', async (c) => {
  const cfEmail = c.req.header('cf-access-authenticated-user-email');
  const adminEmail = c.env.ADMIN_EMAIL || ALLOWED_ADMIN_EMAIL;

  // 1. Direct Cloudflare Access Zero Trust edge verification
  if (cfEmail && cfEmail.trim().toLowerCase() === adminEmail.toLowerCase()) {
    return c.json({
      success: true,
      authenticatedBy: 'cloudflare_access_otp',
      user: {
        email: cfEmail.toLowerCase(),
        name: 'ByteNex Admin',
        role: 'admin',
      },
    });
  }

  // 2. Standard Session Token verification
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const token = authHeader.replace('Bearer ', '').trim();
  const nowIso = new Date().toISOString();

  const session = await c.env.DB.prepare(
    'SELECT * FROM sessions WHERE token = ? AND expires_at > ?'
  ).bind(token, nowIso).first<any>();

  if (!session) {
    return c.json({ success: false, error: 'Session expired or invalid' }, 401);
  }

  return c.json({
    success: true,
    user: {
      email: session.email,
      name: 'ByteNex Admin',
      role: 'admin',
    },
  });
});

/**
 * Logout
 */
authRouter.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '').trim();
    await c.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  }
  return c.json({ success: true });
});
