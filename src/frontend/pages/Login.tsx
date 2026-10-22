import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Mail, ArrowRight, KeyRound, AlertCircle, CheckCircle2, Shield } from 'lucide-react';

export const Login: React.FC = () => {
  const { requestOtp, verifyOtp, loginWithCfAccess } = useAuth();
  const [email, setEmail] = useState('contact@bytenex.io');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);
  const [cfLoading, setCfLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewOtp, setPreviewOtp] = useState<string | null>(null);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await requestOtp(email);
      if (res.success) {
        setStep('otp');
        if (res.previewCode) {
          setPreviewOtp(res.previewCode);
          setOtp(res.previewCode);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code. Please check email address.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await verifyOtp(email, otp);
    } catch (err: any) {
      setError(err.message || 'Invalid or expired OTP code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCfAccessLogin = async () => {
    setError(null);
    setCfLoading(true);
    try {
      const ok = await loginWithCfAccess();
      if (!ok) {
        setError('No Cloudflare Access Zero Trust session detected. Enter your email below to receive an OTP via Cloudflare Email Routing.');
      }
    } catch (err: any) {
      setError(err.message || 'Cloudflare Access verification failed. Use email OTP below.');
    } finally {
      setCfLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100vw',
        background: 'radial-gradient(at 10% 10%, #e6f3f1 0%, #f1f5f7 50%, #edf3f2 100%)',
        padding: '20px',
      }}
    >
      <div
        className="saas-card animate-pop"
        style={{
          width: '100%',
          maxWidth: '430px',
          padding: '36px 32px',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div
            className="sidebar-logo"
            style={{ width: '48px', height: '48px', fontSize: '22px', margin: '0 auto 16px' }}
          >
            In
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
            ByteNex WABA Platform
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Single-Business Administration Console
          </p>
        </div>

        {error && (
          <div
            style={{
              background: 'var(--accent-coral-subtle)',
              border: '1px solid #fecaca',
              borderRadius: 'var(--radius-sm)',
              padding: '12px',
              marginBottom: '18px',
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
              fontSize: '13px',
              color: 'var(--accent-coral)',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {previewOtp && (
          <div
            style={{
              background: 'var(--accent-green-subtle)',
              border: '1px solid #bbf7d0',
              borderRadius: 'var(--radius-sm)',
              padding: '12px',
              marginBottom: '18px',
              fontSize: '12.5px',
              color: '#16a34a',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, marginBottom: '2px' }}>
              <CheckCircle2 size={15} />
              <span>Instant Test Code Generated:</span>
            </div>
            <div>
              One-Time Password: <strong style={{ letterSpacing: '2px' }}>{previewOtp}</strong> (Auto-filled below)
            </div>
          </div>
        )}

        {/* Cloudflare Access Zero Trust OTP Button */}
        {step === 'email' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
            <button
              type="button"
              onClick={handleCfAccessLogin}
              disabled={cfLoading}
              style={{
                width: '100%',
                padding: '11px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1.5px solid #f4a860',
                background: '#fffaf5',
                color: '#c2410c',
                fontWeight: 700,
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Shield size={16} style={{ color: '#ea580c' }} />
              <span>{cfLoading ? 'Checking Cloudflare Edge...' : 'Sign In with Cloudflare Access (Zero Trust OTP)'}</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-light)' }} />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600 }}>
                Or Cloudflare Email Routing OTP
              </span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-light)' }} />
            </div>
          </div>
        )}

        {step === 'email' ? (
          <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: 'var(--text-secondary)',
                  marginBottom: '8px',
                }}
              >
                Admin Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <Mail
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@bytenex.io"
                  required
                  style={{ width: '100%', paddingLeft: '38px', background: '#ffffff' }}
                />
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '6px' }}>
                Single-admin access: <strong style={{ color: 'var(--text-primary)' }}>contact@bytenex.io</strong>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-pitch"
              style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: '6px' }}
            >
              <span>{loading ? 'Sending Code...' : 'Send Verification OTP'}</span>
              <ArrowRight size={16} />
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: 'var(--text-secondary)',
                  marginBottom: '8px',
                }}
              >
                Enter 6-Digit Code
              </label>
              <div style={{ position: 'relative' }}>
                <KeyRound
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <input
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    paddingLeft: '38px',
                    letterSpacing: '6px',
                    fontSize: '18px',
                    fontWeight: 800,
                    textAlign: 'center',
                    background: '#ffffff',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sent to {email}</span>
                <button
                  type="button"
                  onClick={() => setStep('email')}
                  style={{ fontSize: '12px', color: 'var(--accent-peach-hover)', fontWeight: 700 }}
                >
                  Change Email
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="btn-pitch"
              style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: '6px' }}
            >
              <span>{loading ? 'Authenticating...' : 'Sign In to Dashboard'}</span>
              <ArrowRight size={16} />
            </button>
          </form>
        )}

        <div
          style={{
            marginTop: '28px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-light)',
            textAlign: 'center',
            fontSize: '11.5px',
            color: 'var(--text-muted)',
          }}
        >
          100% Cloudflare Free Tier (Workers + D1 + R2)
        </div>
      </div>
    </div>
  );
};
