import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useWaba } from '../context/WabaContext';
import {
  Settings as SettingsIcon,
  Save,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ShieldCheck,
  Cloud,
  RefreshCw,
} from 'lucide-react';

export const Settings: React.FC = () => {
  const { refreshConnection } = useWaba();
  const [settings, setSettings] = useState<any>({
    phone_number_id: '',
    waba_id: '',
    access_token: '',
    app_secret: '',
    verify_token: '',
    display_phone_number: '',
    business_name: 'WibeChat Business',
    resend_api_key: '',
    zeptomail_api_key: '',
    from_email: 'no-reply@bytenex.io',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const res = await api.settings.get();
        if (res.success && res.settings) {
          setSettings(res.settings);
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setSaveSuccess(false);
      const res = await api.settings.save(settings);
      if (res.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        await refreshConnection();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      const res = await api.settings.test();
      setTestResult(res);
      await refreshConnection();
    } catch (err: any) {
      setTestResult({ success: false, error: err.message || 'Connection test failed' });
    } finally {
      setTesting(false);
    }
  };

  const webhookUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhook`;

  const copyToClipboard = (text: string, setter: (val: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  return (
    <div style={{ padding: '0 32px 32px 32px', overflowY: 'auto', flex: 1, minHeight: 0, width: '100%', maxWidth: '960px' }}>
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
              Platform & WABA Settings
            </h2>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              Manage Meta WhatsApp Cloud API credentials, Webhook endpoint, and Cloudflare Free Tier bindings.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className="btn-secondary"
            >
              <RefreshCw size={14} className={testing ? 'animate-spin' : ''} />
              <span>{testing ? 'Testing...' : 'Test Connection'}</span>
            </button>
            <button type="submit" disabled={saving} className="btn-pitch">
              <Save size={14} />
              <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
            </button>
          </div>
        </div>

        {saveSuccess && (
          <div
            style={{
              background: 'var(--accent-green-subtle)',
              border: '1px solid #bbf7d0',
              borderRadius: 'var(--radius-sm)',
              padding: '12px 16px',
              color: '#16a34a',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <CheckCircle2 size={16} />
            <span>Settings successfully saved to Cloudflare D1.</span>
          </div>
        )}

        {testResult && (
          <div
            style={{
              background: testResult.success ? 'var(--accent-green-subtle)' : 'var(--accent-coral-subtle)',
              border: `1px solid ${testResult.success ? '#bbf7d0' : '#fecaca'}`,
              borderRadius: 'var(--radius-sm)',
              padding: '14px 16px',
              fontSize: '13px',
            }}
          >
            {testResult.success ? (
              <div style={{ color: '#16a34a' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, marginBottom: '4px' }}>
                  <CheckCircle2 size={16} />
                  <span>Meta Cloud API Connected Live!</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Verified Name: <strong>{testResult.data?.verified_name || 'N/A'}</strong> •
                  Display Number: <strong>{testResult.data?.display_phone_number || 'N/A'}</strong> •
                  Quality Rating: <strong style={{ color: '#16a34a' }}>{testResult.data?.quality_rating || 'GREEN'}</strong>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--accent-coral)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, marginBottom: '2px' }}>
                  <AlertCircle size={16} />
                  <span>Connection Failed</span>
                </div>
                <div style={{ fontSize: '12px' }}>{testResult.error}</div>
              </div>
            )}
          </div>
        )}

        {/* Section 1: Meta Credentials */}
        <div className="saas-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Meta WhatsApp Cloud API Credentials
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              From Meta Developer Portal &gt; WhatsApp &gt; API Setup.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Phone Number ID
              </label>
              <input
                type="text"
                placeholder="e.g. 104592837492019"
                value={settings.phone_number_id || ''}
                onChange={(e) => setSettings({ ...settings, phone_number_id: e.target.value })}
                style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                WhatsApp Business Account ID (WABA ID)
              </label>
              <input
                type="text"
                placeholder="e.g. 193847291039482"
                value={settings.waba_id || ''}
                onChange={(e) => setSettings({ ...settings, waba_id: e.target.value })}
                style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
              Permanent System User Access Token
            </label>
            <input
              type="password"
              placeholder="EAAG..."
              value={settings.access_token || ''}
              onChange={(e) => setSettings({ ...settings, access_token: e.target.value })}
              style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
            />
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Requires permissions: <code>whatsapp_business_messaging</code> and <code>whatsapp_business_management</code>.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Display Business Name
              </label>
              <input
                type="text"
                value={settings.business_name || 'WibeChat Business'}
                onChange={(e) => setSettings({ ...settings, business_name: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Display Phone Number
              </label>
              <input
                type="text"
                placeholder="+1 (555) 019-2834"
                value={settings.display_phone_number || ''}
                onChange={(e) => setSettings({ ...settings, display_phone_number: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>

        {/* Section 2: Webhook Instructions */}
        <div className="saas-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Meta Webhook Callback URL
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Paste in Meta App Dashboard &gt; WhatsApp &gt; Configuration &gt; Callback URL.
            </p>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
              Callback URL (Webhook Endpoint)
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                readOnly
                value={webhookUrl}
                style={{ flex: 1, fontFamily: 'var(--font-mono)', background: 'var(--bg-subtle)' }}
              />
              <button
                type="button"
                onClick={() => copyToClipboard(webhookUrl, setCopiedWebhook)}
                className="btn-secondary"
              >
                {copiedWebhook ? <Check size={13} style={{ color: '#16a34a' }} /> : <Copy size={13} />}
                <span>{copiedWebhook ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
              Verify Token
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={settings.verify_token || ''}
                onChange={(e) => setSettings({ ...settings, verify_token: e.target.value })}
                style={{ flex: 1, fontFamily: 'var(--font-mono)' }}
              />
              <button
                type="button"
                onClick={() => copyToClipboard(settings.verify_token || '', setCopiedToken)}
                className="btn-secondary"
              >
                {copiedToken ? <Check size={13} style={{ color: '#16a34a' }} /> : <Copy size={13} />}
                <span>{copiedToken ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Under Webhook fields, click <strong>Manage</strong> and check <code>messages</code>.
            </div>
          </div>
        </div>

        {/* Section 3: Single Admin & Email OTP */}
        <div className="saas-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Single-Business Admin Authentication
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Platform admin strictly locked to <strong>contact@bytenex.io</strong>.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Admin Email Address
              </label>
              <input
                type="text"
                readOnly
                value="contact@bytenex.io"
                style={{ width: '100%', background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Resend API Key (Optional fallback)
              </label>
              <input
                type="password"
                placeholder="re_..."
                value={settings.resend_api_key || ''}
                onChange={(e) => setSettings({ ...settings, resend_api_key: e.target.value })}
                style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                ZeptoMail API Key (OTP email — active provider)
              </label>
              <input
                type="password"
                placeholder="Zoho-enczapikey ..."
                value={settings.zeptomail_api_key || ''}
                onChange={(e) => setSettings({ ...settings, zeptomail_api_key: e.target.value })}
                style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
              />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                OTP login emails are dispatched via ZeptoMail (India DC). Paste only the key part, without the <code>Zoho-enczapikey</code> prefix.
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                From Email (must be a verified ZeptoMail sender)
              </label>
              <input
                type="text"
                placeholder="no-reply@bytenex.io"
                value={settings.from_email || ''}
                onChange={(e) => setSettings({ ...settings, from_email: e.target.value })}
                style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
              />
            </div>
          </div>
        </div>

        {/* Section 4: Cloudflare Free Tier Topology */}
        <div className="saas-card" style={{ background: 'var(--bg-panel)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontWeight: 700, marginBottom: '6px' }}>
            <Cloud size={17} style={{ color: '#f38020' }} />
            <span>100% Cloudflare Free Tier Infrastructure</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            • <strong>Cloudflare Workers:</strong> Edge serverless runtime (100,000 req/day free)<br />
            • <strong>Cloudflare D1:</strong> SQLite database (5M queries/day, 5GB storage free)<br />
            • <strong>Cloudflare R2:</strong> Zero-egress object storage for media attachments (10GB free)<br />
            • <strong>Cloudflare Static Assets:</strong> High-performance SPA delivery from global CDN
          </div>
        </div>
      </form>
    </div>
  );
};
