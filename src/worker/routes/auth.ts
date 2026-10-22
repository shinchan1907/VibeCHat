import { Hono } from 'hono';
import { Env, WabaSettings } from '../types';
import { EmailService } from '../services/email';

export const authRouter = new Hono<{ Bindings: Env }>();

const ALLOWED_ADMIN_EMAIL = 'contact@bytenex.io';
const OTP_MAX_SENDS_PER_15MIN = 5;
const OTP_MAX_VERIFY_ATTEMPTS = 5;

/** Cryptographically secure 6-digit code (was Math.random — predictable). */
function generateOtpCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (100000 + (buf[0] % 900000)).toString();
}

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

/* ------------------------------------------------------------------ */
/* Cloudflare Access JWT verification                                  */
/*                                                                     */
/* SECURITY: Cf-Access-Authenticated-User-Email is just a header. If   */
/* the worker is reachable without going through Cloudflare Access     */
/* (e.g. its workers.dev URL), anyone can set that header and become   */
/* admin. So the header is only trusted after the accompanying       */
/* Cf-Access-Jwt-Assertion is verified against the team's JWKS, and   */
/* the whole path stays disabled until CF_ACCESS_TEAM_DOMAIN is set.  */
/* ------------------------------------------------------------------ */
let jwksCache: { keys: any[]; fetchedAt: number } | null = null;

async function getAccessKeys(teamDomain: string): Promise<any[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < 10 * 60 * 1000) {
    return jwksCache.keys;
  }
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs fetch failed (${res.status})`);
  const data = (await res.json()) as any;
  jwksCache = { keys: data.keys || [], fetchedAt: Date.now() };
  return jwksCache.keys;
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const buffer = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Returns the verified admin email, or null if verification fails / is not configured. */
async function verifyCfAccessEmail(c: any): Promise<string | null> {
  const env = c.env as Env;
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
  if (!teamDomain) return null; // Access path disabled until configured

  const jwt = c.req.header('cf-access-jwt-assertion');
  const headerEmail = c.req.header('cf-access-authenticated-user-email');
  if (!jwt || !headerEmail) return null;

  try {
    const [h, p, sig] = jwt.split('.');
    if (!h || !p || !sig) return null;
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));

    const keys = await getAccessKeys(teamDomain);
    const jwk = keys.find((k: any) => k.kid === header.kid) || keys[0];
    if (!jwk) return null;

    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64urlToBytes(sig),
      new TextEncoder().encode(`${h}.${p}`)
    );
    if (!valid) return null;

    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) return null;
    if (payload.iss !== `https://${teamDomain}`) return null;
    if (env.CF_ACCESS_AUD) {
      const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (!auds.includes(env.CF_ACCESS_AUD)) return null;
    }
    const email = (payload.email || headerEmail).toLowerCase();
    if (email !== headerEmail.toLowerCase()) return null;
    return email;
  } catch {
    return null;
  }
}

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

  // Rate limit: max OTP_MAX_SENDS_PER_15MIN codes per email / per IP per 15 min.
  // NOTE: compare with SQLite datetime() — otp_codes.created_at is written by
  // CURRENT_TIMESTAMP ("YYYY-MM-DD HH:MM:SS"), and binding an ISO string here
  // silently breaks the comparison (' ' < 'T'), disabling the limit.
  const ip = c.req.header('cf-connecting-ip') || 'unknown';
  const recent = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM otp_codes WHERE created_at > datetime('now', '-15 minutes') AND (email = ? OR ip = ?)"
  ).bind(email.toLowerCase(), ip).first<any>();
  if (recent && recent.n >= OTP_MAX_SENDS_PER_15MIN) {
    return c.json(
      { success: false, error: 'Too many verification codes requested. Please wait a few minutes and try again.' },
      429
    );
  }

  const code = generateOtpCode();
  const id = generateId('otp');

  // Store in D1
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await c.env.DB.prepare(
    'INSERT INTO otp_codes (id, email, code, expires_at, used, attempts, ip) VALUES (?, ?, ?, ?, 0, 0, ?)'
  ).bind(id, email.toLowerCase(), code, expiresAt, ip).run();

  // Retrieve settings for email dispatch
  const settings = await c.env.DB.prepare('SELECT * FROM waba_settings WHERE id = "default"').first<WabaSettings>();
  const emailService = new EmailService(settings || { id: 'default' }, c.env);
  const result = await emailService.sendOtpEmail(email, code);

  // Log activity
  await c.env.DB.prepare(
    'INSERT INTO activity_logs (id, event_type, description, details) VALUES (?, ?, ?, ?)'
  ).bind(
    generateId('log'),
    'auth_otp_requested',
    `OTP generated for ${email}`,
    JSON.stringify({ method: result.method, sent: result.sent, diag: result.diag })
  ).run();

  if (!result.sent) {
    return c.json(
      {
        success: false,
        error:
          'Email delivery is not configured on this deployment yet (Cloudflare send_email / Resend). The code was generated but could not be delivered.',
      },
      502
    );
  }

  return c.json({
    success: true,
    message: `Verification code sent to ${email}`,
    // Only ever present when ENVIRONMENT=development (local dev convenience).
    ...(result.previewCode ? { previewCode: result.previewCode } : {}),
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
  // Latest live OTP for this email — attempts are tracked on the code itself,
  // so brute-forcing burns the code after OTP_MAX_VERIFY_ATTEMPTS misses.
  const record = await c.env.DB.prepare(
    'SELECT * FROM otp_codes WHERE email = ? AND used = 0 AND expires_at > ? ORDER BY created_at DESC LIMIT 1'
  ).bind(email.toLowerCase(), nowIso).first<any>();

  if (!record) {
    return c.json({ success: false, error: 'Invalid or expired verification code' }, 400);
  }

  if ((record.attempts || 0) >= OTP_MAX_VERIFY_ATTEMPTS) {
    await c.env.DB.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').bind(record.id).run();
    return c.json(
      { success: false, error: 'Too many incorrect attempts. Please request a new code.' },
      429
    );
  }

  if (record.code !== code.trim()) {
    await c.env.DB.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').bind(record.id).run();
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
    generateId('log'),
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
 * Cloudflare Access (Zero Trust) session issuance.
 * Requires a *verified* Access JWT — see verifyCfAccessEmail above.
 */
authRouter.get('/cf-access', async (c) => {
  const adminEmail = c.env.ADMIN_EMAIL || ALLOWED_ADMIN_EMAIL;
  const cfEmail = await verifyCfAccessEmail(c);

  if (cfEmail && cfEmail === adminEmail.toLowerCase()) {
    const token = `sess_cf_${crypto.randomUUID().replace(/-/g, '')}_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await c.env.DB.prepare(
      'INSERT INTO sessions (token, email, expires_at) VALUES (?, ?, ?)'
    ).bind(token, cfEmail, expiresAt).run();

    await c.env.DB.prepare(
      'INSERT INTO activity_logs (id, event_type, description, details) VALUES (?, ?, ?, ?)'
    ).bind(
      generateId('log'),
      'auth_cloudflare_access_login',
      `Admin authenticated via verified Cloudflare Access JWT: ${cfEmail}`,
      JSON.stringify({ method: 'cloudflare_zero_trust_otp', jwtVerified: true })
    ).run();

    return c.json({
      success: true,
      token,
      method: 'cloudflare_access_otp',
      user: {
        email: cfEmail,
        name: 'ByteNex Admin',
        role: 'admin',
      },
    });
  }

  return c.json({
    success: false,
    error: 'No verified Cloudflare Access session on this request. (Access login activates once CF_ACCESS_TEAM_DOMAIN is configured and the app sits behind Cloudflare Access.)',
  }, 401);
});

/**
 * Get Current Session / Me
 */
authRouter.get('/me', async (c) => {
  const adminEmail = c.env.ADMIN_EMAIL || ALLOWED_ADMIN_EMAIL;

  // 1. Verified Cloudflare Access JWT only — never the bare email header.
  const cfEmail = await verifyCfAccessEmail(c);
  if (cfEmail && cfEmail === adminEmail.toLowerCase()) {
    return c.json({
      success: true,
      authenticatedBy: 'cloudflare_access_otp',
      user: {
        email: cfEmail,
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
