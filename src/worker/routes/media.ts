import { Hono } from 'hono';
import { Env, WabaSettings } from '../types';

export const mediaRouter = new Hono<{ Bindings: Env }>();

/**
 * Upload media attachment (to Cloudflare R2 or local fallback)
 */
mediaRouter.post('/upload', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || !(file instanceof File)) {
    return c.json({ success: false, error: 'No valid file uploaded' }, 400);
  }

  const filename = file.name || `file_${Date.now()}`;
  const contentType = file.type || 'application/octet-stream';
  const fileKey = `uploads/${Date.now()}_${Math.random().toString(36).substring(7)}_${filename.replace(/\s+/g, '_')}`;

  if (c.env.MEDIA_BUCKET) {
    try {
      const buffer = await file.arrayBuffer();
      await c.env.MEDIA_BUCKET.put(fileKey, buffer, {
        httpMetadata: { contentType },
      });

      return c.json({
        success: true,
        url: `/api/media/file/${encodeURIComponent(fileKey)}`,
        filename,
        contentType,
        size: file.size,
      });
    } catch (err: any) {
      console.warn('R2 put error:', err);
    }
  }

  // Fallback: Data URL if R2 bucket is not yet provisioned
  const arrayBuffer = await file.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  );
  const dataUrl = `data:${contentType};base64,${base64}`;

  return c.json({
    success: true,
    url: dataUrl,
    filename,
    contentType,
    size: file.size,
  });
});

/**
 * Serve uploaded media file from Cloudflare R2
 */
mediaRouter.get('/file/:key', async (c) => {
  const key = decodeURIComponent(c.req.param('key'));

  if (!c.env.MEDIA_BUCKET) {
    return c.text('R2 bucket binding not available', 404);
  }

  const object = await c.env.MEDIA_BUCKET.get(key);
  if (!object) {
    return c.text('File not found', 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  return new Response(object.body, { headers });
});

/**
 * Proxy Meta WhatsApp Media ID (download audio, image, document from Meta)
 */
mediaRouter.get('/proxy/:mediaId', async (c) => {
  const mediaId = c.req.param('mediaId');

  const settings = await c.env.DB.prepare('SELECT access_token FROM waba_settings WHERE id = "default"').first<WabaSettings>();
  if (!settings?.access_token) {
    return c.text('Unauthorized Meta credentials', 401);
  }

  try {
    // 1. Get temporary media URL from Meta Graph API
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${settings.access_token}` },
    });
    const metaData = await metaRes.json() as any;

    if (!metaRes.ok || !metaData.url) {
      return c.text('Failed to locate media from Meta', 404);
    }

    // 2. Fetch the actual binary stream
    const mediaRes = await fetch(metaData.url, {
      headers: { Authorization: `Bearer ${settings.access_token}` },
    });

    const headers = new Headers();
    if (metaData.mime_type) headers.set('Content-Type', metaData.mime_type);
    headers.set('Cache-Control', 'public, max-age=86400');

    return new Response(mediaRes.body, { headers });
  } catch (err: any) {
    return c.text(`Media proxy error: ${err.message}`, 500);
  }
});
