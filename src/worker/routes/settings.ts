import { Hono } from 'hono';
import { Env, WabaSettings } from '../types';
import { MetaApiService } from '../services/meta-api';

export const settingsRouter = new Hono<{ Bindings: Env }>();

/**
 * Get Settings & Meta Connection Status
 */
settingsRouter.get('/', async (c) => {
  let settings = await c.env.DB.prepare('SELECT * FROM waba_settings WHERE id = "default"').first<WabaSettings>();

  if (!settings) {
    settings = {
      id: 'default',
      business_name: 'ByteNex WABA',
      verify_token: 'bytenex_waba_verify_2026',
      from_email: 'contact@bytenex.io',
    };
  }

  // Mask sensitive tokens for security
  const maskedSettings = {
    ...settings,
    access_token: settings.access_token
      ? `${settings.access_token.substring(0, 8)}...${settings.access_token.substring(settings.access_token.length - 6)}`
      : '',
    app_secret: settings.app_secret ? '••••••••••••••••' : '',
    resend_api_key: settings.resend_api_key
      ? `${settings.resend_api_key.substring(0, 5)}...`
      : '',
    has_access_token: Boolean(settings.access_token),
    has_app_secret: Boolean(settings.app_secret),
    has_resend_api_key: Boolean(settings.resend_api_key),
  };

  return c.json({ success: true, settings: maskedSettings });
});

/**
 * Save Settings
 */
settingsRouter.post('/', async (c) => {
  const payload = await c.req.json<Partial<WabaSettings>>();
  const current = await c.env.DB.prepare('SELECT * FROM waba_settings WHERE id = "default"').first<WabaSettings>() || { id: 'default' };

  // Don't overwrite access_token if user didn't change it (e.g. masked string)
  const accessToken = (payload.access_token && !payload.access_token.includes('...'))
    ? payload.access_token
    : current.access_token;

  const appSecret = (payload.app_secret && !payload.app_secret.includes('•'))
    ? payload.app_secret
    : current.app_secret;

  const resendKey = (payload.resend_api_key && !payload.resend_api_key.includes('...'))
    ? payload.resend_api_key
    : current.resend_api_key;

  const nowIso = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO waba_settings (
      id, phone_number_id, waba_id, access_token, app_secret, 
      verify_token, display_phone_number, business_name, 
      resend_api_key, from_email, updated_at
    ) VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      phone_number_id = excluded.phone_number_id,
      waba_id = excluded.waba_id,
      access_token = excluded.access_token,
      app_secret = excluded.app_secret,
      verify_token = excluded.verify_token,
      display_phone_number = excluded.display_phone_number,
      business_name = excluded.business_name,
      resend_api_key = excluded.resend_api_key,
      from_email = excluded.from_email,
      updated_at = excluded.updated_at`
  ).bind(
    payload.phone_number_id ?? current.phone_number_id ?? null,
    payload.waba_id ?? current.waba_id ?? null,
    accessToken ?? null,
    appSecret ?? null,
    payload.verify_token ?? current.verify_token ?? 'bytenex_waba_verify_2026',
    payload.display_phone_number ?? current.display_phone_number ?? null,
    payload.business_name ?? current.business_name ?? 'ByteNex WABA',
    resendKey ?? null,
    payload.from_email ?? current.from_email ?? 'contact@bytenex.io',
    nowIso
  ).run();

  return c.json({ success: true, message: 'Settings successfully updated' });
});

/**
 * Test Connection with Meta Graph API
 */
settingsRouter.post('/test', async (c) => {
  const settings = await c.env.DB.prepare('SELECT * FROM waba_settings WHERE id = "default"').first<WabaSettings>();
  if (!settings || !settings.access_token || !settings.phone_number_id) {
    return c.json({
      success: false,
      error: 'Please enter and save your Phone Number ID and Meta Access Token before testing.',
    }, 400);
  }

  const metaApi = new MetaApiService(settings);
  const result = await metaApi.testConnection();

  return c.json(result);
});

/**
 * Activity & Webhook Audit Logs
 */
settingsRouter.get('/logs', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 100'
  ).all<any>();

  const logs = (rows.results || []).map((l) => ({
    ...l,
    details: typeof l.details === 'string' ? JSON.parse(l.details || '{}') : (l.details || {}),
  }));

  return c.json({ success: true, logs });
});

/**
 * Clear Audit Logs
 */
settingsRouter.delete('/logs', async (c) => {
  await c.env.DB.prepare('DELETE FROM activity_logs').run();
  return c.json({ success: true });
});
