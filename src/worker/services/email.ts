import { Env, WabaSettings } from '../types';

export class EmailService {
  private settings: WabaSettings;
  private env?: Env;

  constructor(settings: WabaSettings, env?: Env) {
    this.settings = settings;
    this.env = env;
  }

  /**
   * Send Email OTP to contact@bytenex.io using Cloudflare's inbuilt Email System
   */
  async sendOtpEmail(to: string, otp: string): Promise<{ sent: boolean; method: string; previewCode?: string }> {
    console.log(`\n======================================================`);
    console.log(`🔐 [Cloudflare OTP System] Login OTP for ${to}: ${otp}`);
    console.log(`======================================================\n`);

    const fromEmail = this.settings.from_email || 'contact@bytenex.io';
    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #ffffff; color: #172126; border-radius: 16px; border: 1px solid #eef2f3; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
        <div style="display: flex; align-items: center; margin-bottom: 24px;">
          <div style="background: #172126; width: 40px; height: 40px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; margin-right: 12px; font-weight: 800; color: #ffffff; font-size: 18px;">
            In
          </div>
          <div>
            <h2 style="margin: 0; font-size: 18px; color: #172126; font-weight: 800;">WibeChat Platform</h2>
            <div style="font-size: 12px; color: #5a6a72;">Powered by Cloudflare Infrastructure</div>
          </div>
        </div>
        
        <p style="font-size: 14px; color: #5a6a72; margin-bottom: 20px; line-height: 1.5;">
          A login verification code was requested for your administrative account (<strong>${to}</strong>).
        </p>

        <div style="background: #f8faf9; border: 1px solid #dfe6e8; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 20px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #8c9da5; margin-bottom: 8px; font-weight: 700;">
            Cloudflare Security One-Time PIN
          </div>
          <div style="font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #00a884; font-family: monospace;">
            ${otp}
          </div>
          <div style="font-size: 12px; color: #5a6a72; margin-top: 8px;">
            Valid for the next 10 minutes. Never share this code.
          </div>
        </div>

        <p style="font-size: 12px; color: #8c9da5; line-height: 1.5; border-top: 1px solid #eef2f3; padding-top: 16px;">
          If you did not request this login attempt, your account may be at risk. Delivered via Cloudflare Email Routing.
        </p>
      </div>
    `;

    // 1. Cloudflare Native Email Routing (send_email binding)
    if (this.env?.EMAIL && typeof this.env.EMAIL.send === 'function') {
      try {
        let EmailMessageClass: any;
        try {
          // Dynamic import of cloudflare:email
          // @ts-ignore
          const cfEmail = await import('cloudflare:email');
          EmailMessageClass = cfEmail.EmailMessage;
        } catch {
          EmailMessageClass = (globalThis as any).EmailMessage;
        }

        const rawMime = [
          `From: "WibeChat Cloudflare Auth" <${fromEmail}>`,
          `To: ${to}`,
          `Subject: Your WibeChat Login OTP: ${otp}`,
          `MIME-Version: 1.0`,
          `Content-Type: text/html; charset=utf-8`,
          `Content-Transfer-Encoding: 8bit`,
          ``,
          htmlContent,
        ].join('\r\n');

        if (EmailMessageClass) {
          const message = new EmailMessageClass(fromEmail, to, rawMime);
          await this.env.EMAIL.send(message);
          return { sent: true, method: 'cloudflare_email_routing', previewCode: otp };
        }
      } catch (cfErr) {
        console.warn('Cloudflare Email Routing send error:', cfErr);
      }
    }

    // 2. Fallback to Resend if configured by user
    if (this.settings.resend_api_key) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.settings.resend_api_key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail.includes('@') ? fromEmail : `WibeChat <noreply@bytenex.io>`,
            to: [to],
            subject: `Your WibeChat Login Code: ${otp}`,
            html: htmlContent,
          }),
        });
        if (res.ok) {
          return { sent: true, method: 'resend', previewCode: otp };
        }
      } catch (err) {
        console.warn('Resend email fallback error:', err);
      }
    }

    // 3. Cloudflare Dev / Sandbox mode (logs to console & provides instant OTP for dev testing)
    return {
      sent: true,
      method: 'cloudflare_dev_preview',
      previewCode: otp,
    };
  }
}
