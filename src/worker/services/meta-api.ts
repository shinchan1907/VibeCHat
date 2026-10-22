import { WabaSettings } from '../types';

const META_GRAPH_VERSION = 'v21.0';
const META_BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export class MetaApiService {
  private settings: WabaSettings;

  constructor(settings: WabaSettings) {
    this.settings = settings;
  }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.settings.access_token || ''}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Test WhatsApp Cloud API Connection & Token Validity
   */
  async testConnection(): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    if (!this.settings.access_token || !this.settings.phone_number_id) {
      return {
        success: false,
        error: 'Phone Number ID and Access Token must be configured in Settings',
      };
    }

    try {
      const url = `${META_BASE_URL}/${this.settings.phone_number_id}?fields=verified_name,display_phone_number,quality_rating,code_verification_status,throughput,account_mode`;
      const res = await fetch(url, { headers: this.getHeaders() });
      const data = await res.json() as any;

      if (!res.ok) {
        return {
          success: false,
          error: data?.error?.message || `Meta API error (${res.status})`,
        };
      }

      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Connection failed' };
    }
  }

  /**
   * Send text, media, interactive button, or template message
   */
  async sendMessage(payload: {
    to: string;
    type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'template' | 'interactive';
    text?: string;
    mediaUrl?: string;
    mediaCaption?: string;
    template?: {
      name: string;
      language: { code: string };
      components?: any[];
    };
    interactive?: any;
    replyToMessageId?: string;
  }): Promise<{ success: boolean; wamid?: string; error?: string; raw?: any }> {
    if (!this.settings.access_token || !this.settings.phone_number_id) {
      // In mock/demo mode if credentials aren't set yet
      return {
        success: true,
        wamid: `wamid.MOCK_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        raw: { mock: true, note: 'Mock delivery (configure Meta API credentials in Settings)' }
      };
    }

    // Clean phone number (digits only, e.g. +1 555-1234 -> 15551234)
    const cleanTo = payload.to.replace(/\D/g, '');

    const body: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: payload.type,
    };

    if (payload.replyToMessageId) {
      body.context = { message_id: payload.replyToMessageId };
    }

    if (payload.type === 'text') {
      body.text = { body: payload.text || '', preview_url: true };
    } else if (payload.type === 'image') {
      body.image = { link: payload.mediaUrl, caption: payload.mediaCaption };
    } else if (payload.type === 'document') {
      body.document = { link: payload.mediaUrl, caption: payload.mediaCaption };
    } else if (payload.type === 'audio') {
      body.audio = { link: payload.mediaUrl };
    } else if (payload.type === 'video') {
      body.video = { link: payload.mediaUrl, caption: payload.mediaCaption };
    } else if (payload.type === 'template' && payload.template) {
      body.template = payload.template;
    } else if (payload.type === 'interactive' && payload.interactive) {
      body.interactive = payload.interactive;
    }

    try {
      const url = `${META_BASE_URL}/${this.settings.phone_number_id}/messages`;
      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      const data = await res.json() as any;

      if (!res.ok) {
        return {
          success: false,
          error: data?.error?.message || `Meta API error (${res.status})`,
          raw: data,
        };
      }

      const wamid = data?.messages?.[0]?.id;
      return { success: true, wamid, raw: data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network request failed' };
    }
  }

  /**
   * Mark message as read
   */
  async markMessageAsRead(messageId: string): Promise<boolean> {
    if (!this.settings.access_token || !this.settings.phone_number_id) return true;

    try {
      const url = `${META_BASE_URL}/${this.settings.phone_number_id}/messages`;
      await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        }),
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sync templates from Meta Graph API
   */
  async getTemplates(): Promise<{ success: boolean; templates?: any[]; error?: string }> {
    if (!this.settings.access_token || !this.settings.waba_id) {
      return { success: false, error: 'WABA ID and Access Token must be set in Settings' };
    }

    try {
      const url = `${META_BASE_URL}/${this.settings.waba_id}/message_templates?limit=100`;
      const res = await fetch(url, { headers: this.getHeaders() });
      const data = await res.json() as any;

      if (!res.ok) {
        return { success: false, error: data?.error?.message || 'Failed to fetch templates' };
      }

      return { success: true, templates: data.data || [] };
    } catch (err: any) {
      return { success: false, error: err.message || 'Fetch failed' };
    }
  }

  /**
   * Create template on Meta
   */
  async createTemplate(payload: {
    name: string;
    category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
    language: string;
    components: any[];
  }): Promise<{ success: boolean; id?: string; error?: string; raw?: any }> {
    if (!this.settings.access_token || !this.settings.waba_id) {
      return { success: false, error: 'WABA ID and Access Token must be set in Settings' };
    }

    try {
      const url = `${META_BASE_URL}/${this.settings.waba_id}/message_templates`;
      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json() as any;

      if (!res.ok) {
        return { success: false, error: data?.error?.message || 'Template creation failed', raw: data };
      }

      return { success: true, id: data.id, raw: data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Template creation failed' };
    }
  }

  /**
   * Delete template from Meta
   */
  async deleteTemplate(name: string): Promise<{ success: boolean; error?: string }> {
    if (!this.settings.access_token || !this.settings.waba_id) {
      return { success: false, error: 'WABA ID and Access Token must be set in Settings' };
    }

    try {
      const url = `${META_BASE_URL}/${this.settings.waba_id}/message_templates?name=${encodeURIComponent(name)}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });

      const data = await res.json() as any;
      if (!res.ok) {
        return { success: false, error: data?.error?.message || 'Delete template failed' };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Delete template failed' };
    }
  }

  /**
   * Sync Flows from Meta
   */
  async getFlows(): Promise<{ success: boolean; flows?: any[]; error?: string }> {
    if (!this.settings.access_token || !this.settings.waba_id) {
      return { success: false, error: 'WABA ID and Access Token required' };
    }

    try {
      const url = `${META_BASE_URL}/${this.settings.waba_id}/flows`;
      const res = await fetch(url, { headers: this.getHeaders() });
      const data = await res.json() as any;

      if (!res.ok) {
        return { success: false, error: data?.error?.message || 'Failed to fetch flows' };
      }

      return { success: true, flows: data.data || [] };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
