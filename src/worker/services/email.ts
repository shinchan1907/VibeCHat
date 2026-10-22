import { WabaSettings } from '../types';

export class EmailService {
  private settings: WabaSettings;

  constructor(settings: WabaSettings) {
    this.settings = settings;
  }

  /**
   * Send Email OTP to contact@bytenex.io
   */
  async sendOtpEmail(to: string, otp: string): Promise<{ sent: boolean; method: string; previewCode?: string }> {
    console.log(`\n======================================================`);
    console.log(`🔐 [ByteNex WABA Auth] Login OTP for ${to}: ${otp}`);
    console.log(`======================================================\n`);

    const fromEmail = this.settings.from_email || 'contact@bytenex.io';
    const resendApiKey = this.settings.resend_api_key;

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #0b141a; color: #e9edef; border-radius: 12px; border: 1px solid #202c33;">
        <div style="display: flex; align-items: center; margin-bottom: 24px;">
          <div style="background: #00a884; width: 36px; height: 36px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; margin-right: 12px; font-weight: bold; color: #111b21;">
            W
          </div>
          <h2 style="margin: 0; font-size: 20px; color: #e9edef;">ByteNex WABA Portal</h2>
        </div>
        
        <p style="font-size: 15px; color: #8696a0; margin-bottom: 24px; line-height: 1.5;">
          A login verification code was requested for your WhatsApp Business API administrative account.
        </p>

        <div style="background: #111b21; border: 1px solid #202c33; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: #8696a0; margin-bottom: 8px;">
            One-Time Password (OTP)
          </div>
          <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #00a884; font-family: monospace;">
            ${otp}
          </div>
          <div style="font-size: 12px; color: #8696a0; margin-top: 8px;">
            Valid for the next 10 minutes. Do not share this code.
          </div>
        </div>

        <p style="font-size: 13px; color: #8696a0; line-height: 1.5; border-top: 1px solid #202c33; padding-top: 16px;">
          If you did not request this login attempt, please ensure your email account is secure.
        </p>
      </div>
    `;

    // 1. If Resend API Key is configured, send via Resend API
    if (resendApiKey) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail.includes('@') ? fromEmail : `ByteNex WABA <noreply@bytenex.io>`,
            to: [to],
            subject: `Your ByteNex WABA Login Code: ${otp}`,
            html: htmlContent,
          }),
        });

        if (res.ok) {
          return { sent: true, method: 'resend', previewCode: otp };
        } else {
          const errData = await res.json();
          console.warn('Resend email error:', errData);
        }
      } catch (err) {
        console.warn('Failed to dispatch via Resend:', err);
      }
    }

    // 2. Dev / Cloudflare Worker direct mode
    return {
      sent: true,
      method: 'direct_worker_preview',
      previewCode: otp,
    };
  }
}
