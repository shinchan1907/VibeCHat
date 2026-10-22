import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import {
  Activity,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Radio,
  FileText,
  Webhook,
} from 'lucide-react';

interface AuditLog {
  id: string;
  event_type: string;
  description: string;
  details: any;
  created_at: string;
}

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const res = await api.settings.getLogs();
      if (res.success) {
        setLogs(res.logs);
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const handleClear = async () => {
    if (!confirm('Clear all audit and webhook logs?')) return;
    try {
      await api.settings.clearLogs();
      setLogs([]);
    } catch (err: any) {
      alert(err.message || 'Failed to clear logs');
    }
  };

  const getEventIcon = (type: string) => {
    if (type.startsWith('auth')) return <ShieldCheck size={15} style={{ color: '#16a34a' }} />;
    if (type.startsWith('webhook')) return <Webhook size={15} style={{ color: '#3b82f6' }} />;
    if (type.startsWith('broadcast')) return <Radio size={15} style={{ color: 'var(--accent-peach-hover)' }} />;
    if (type.startsWith('template')) return <FileText size={15} style={{ color: '#8b5cf6' }} />;
    return <Activity size={15} style={{ color: 'var(--text-secondary)' }} />;
  };

  return (
    <div style={{ padding: '0 32px 32px 32px', overflowY: 'auto', flex: 1, minHeight: 0, width: '100%', maxWidth: '960px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
            Audit & Webhook Event Logs
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Observability log stream of Meta webhook receipts, authentication attempts, and outbound dispatches.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={loadLogs} disabled={loading} className="btn-secondary">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button onClick={handleClear} className="btn-danger">
            <Trash2 size={13} />
            <span>Clear Logs</span>
          </button>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="saas-card" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
          <Activity size={42} style={{ color: 'var(--accent-peach)', margin: '0 auto 12px', opacity: 0.8 }} />
          <h3 style={{ fontSize: '16px', color: 'var(--text-primary)', fontWeight: 700, marginBottom: '4px' }}>
            No Activity Logs Recorded
          </h3>
          <p style={{ maxWidth: '380px', margin: '0 auto', fontSize: '12.5px' }}>
            When incoming webhooks or messages are processed by Cloudflare Workers, detailed event payloads will appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {logs.map((log) => {
            const isExpanded = expandedId === log.id;
            return (
              <div
                key={log.id}
                className="saas-card"
                style={{
                  padding: '12px 18px',
                  cursor: 'pointer',
                  border: isExpanded ? '1px solid var(--accent-peach)' : '1px solid var(--border-light)',
                }}
                onClick={() => setExpandedId(isExpanded ? null : log.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {getEventIcon(log.event_type)}
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {log.description}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {log.event_type}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                </div>

                {isExpanded && (
                  <div
                    style={{
                      marginTop: '10px',
                      paddingTop: '10px',
                      borderTop: '1px solid var(--border-light)',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <pre
                      style={{
                        background: 'var(--bg-panel)',
                        padding: '12px',
                        borderRadius: '6px',
                        fontSize: '11.5px',
                        fontFamily: 'var(--font-mono)',
                        overflowX: 'auto',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
