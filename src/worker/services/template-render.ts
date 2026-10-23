/**
 * Shared helpers for WhatsApp template messages: building the Meta
 * `components` payload and rendering a human-readable version of the
 * template for the chat timeline (so chats show the actual template
 * content, not just the template name).
 */

export const MEDIA_HEADER_TYPES = ['IMAGE', 'VIDEO', 'DOCUMENT'];

export function buildTemplateComponents(template: any, variables: string[] = [], headerMediaId?: string): any[] {
  const components: any[] = [];
  if (MEDIA_HEADER_TYPES.includes(template?.header_type || '') && headerMediaId) {
    const ht = String(template.header_type).toLowerCase(); // image | video | document
    components.push({
      type: 'header',
      parameters: [{ type: ht, [ht]: { id: headerMediaId } }],
    });
  }
  if (variables && variables.length > 0) {
    components.push({
      type: 'body',
      parameters: variables.map((val) => ({ type: 'text', text: val })),
    });
  }
  return components;
}

export function renderTemplateContent(template: any, variables: string[] = [], recipientName?: string): string {
  const lines: string[] = [];
  const ht = template?.header_type;
  if (ht === 'IMAGE') lines.push('🖼️ [Image Header]');
  else if (ht === 'VIDEO') lines.push('🎬 [Video Header]');
  else if (ht === 'DOCUMENT') lines.push('📎 [Document Header]');
  else if (ht === 'TEXT' && template?.header_content) lines.push(String(template.header_content));

  let body = String(template?.body_text || '');
  (variables || []).forEach((v, i) => {
    const value = v === '{{name}}' ? (recipientName || 'Customer') : v;
    body = body.split(`{{${i + 1}}}`).join(value);
  });
  if (body) lines.push(body);

  if (template?.footer_text) lines.push(String(template.footer_text));

  let buttons: any[] = [];
  try {
    buttons = typeof template?.buttons_json === 'string' ? JSON.parse(template.buttons_json || '[]') : (template?.buttons_json || []);
  } catch { buttons = []; }
  const buttonTexts = (buttons || []).map((b: any) => b?.text).filter(Boolean);
  if (buttonTexts.length > 0) lines.push(`🔘 ${buttonTexts.join('   •   ')}`);

  return lines.join('\n');
}
