import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';
import {
  Radio,
  Plus,
  Send,
  Users,
  CheckCircle2,
  Clock,
  Eye,
  CheckCheck,
  AlertCircle,
  FileText,
  Percent,
} from 'lucide-react';

interface Broadcast {
  id: string;
  name: string;
  template_name: string;
  template_language: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  target_tags: string[];
  created_at: string;
}

export const Broadcasts: React.FC = () => {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedBroadcast, setSelectedBroadcast] = useState<any>(null);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);

  // Create Campaign Form
  const [campaignName, setCampaignName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [targetType, setTargetType] = useState<'all' | 'tags' | 'numbers'>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [phoneNumbersInput, setPhoneNumbersInput] = useState('');
  const [templateVars, setTemplateVars] = useState<string[]>([]);
  const [dispatching, setDispatching] = useState(false);
  const [headerMediaId, setHeaderMediaId] = useState('');
  const [headerMediaName, setHeaderMediaName] = useState('');
  const [headerUploading, setHeaderUploading] = useState(false);

  const [retryEnabled, setRetryEnabled] = useState(false);
  const [retryWindow, setRetryWindow] = useState(24);
  const [testPhone, setTestPhone] = useState('919988777634');
  const [testSending, setTestSending] = useState(false);
  const [testNote, setTestNote] = useState('');

  const handleTestSend = async () => {
    if (!selectedTemplateId || !testPhone.trim()) return;
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (tpl && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(tpl.header_type || '') && !headerMediaId) {
      setTestNote('Upload the header media first — the test send needs it too.');
      return;
    }
    try {
      setTestSending(true);
      setTestNote('');
      const res = await api.broadcasts.testSend({
        template_id: selectedTemplateId,
        phone_number: testPhone.trim(),
        variables: templateVars,
        header_media_id: headerMediaId || undefined,
      });
      if (res.success) setTestNote(`✓ Test message sent to +${testPhone.trim()} — check WhatsApp and the chat in Live Chats.`);
    } catch (err: any) {
      setTestNote(`Test send failed: ${err.message || 'unknown error'}`);
    } finally {
      setTestSending(false);
    }
  };

  const handleHeaderMediaUpload = async (file: File) => {
    try {
      setHeaderUploading(true);
      const res = await api.broadcasts.uploadHeaderMedia(file);
      if (res.success) {
        setHeaderMediaId(res.media_id);
        setHeaderMediaName(res.filename || file.name);
      }
    } catch (err: any) {
      alert(err.message || 'Header media upload failed');
      setHeaderMediaId('');
      setHeaderMediaName('');
    } finally {
      setHeaderUploading(false);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [bcastRes, tplRes, tagsRes] = await Promise.all([
        api.broadcasts.list(),
        api.templates.list({ status: 'APPROVED' }),
        api.contacts.getTags(),
      ]);

      if (bcastRes.success) setBroadcasts(bcastRes.broadcasts);
      if (tplRes.success) setTemplates(tplRes.templates);
      if (tagsRes.success) setTags(tagsRes.tags);
    } catch (err) {
      console.error('Failed to load broadcasts data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleViewDetails = async (id: string) => {
    try {
      const res = await api.broadcasts.get(id);
      if (res.success) {
        setSelectedBroadcast(res.broadcast);
        setRecipients(res.recipients);
        setAnalytics((res as any).analytics || null);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to fetch broadcast logs');
    }
  };

  const handleLaunchCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignName || !selectedTemplateId) return;

    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (tpl && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(tpl.header_type || '') && !headerMediaId) {
      alert(`This template has a ${String(tpl.header_type).toLowerCase()} header — please upload the header media first.`);
      return;
    }

    try {
      setDispatching(true);
      let parsedNumbers: string[] = [];
      if (targetType === 'numbers') {
        parsedNumbers = phoneNumbersInput
          .split(/[\n,]+/)
          .map((n) => n.trim())
          .filter((n) => n.length > 5);
      }

      const res = await api.broadcasts.create({
        name: campaignName,
        template_id: selectedTemplateId,
        target_type: targetType,
        target_tags: selectedTags,
        phone_numbers: parsedNumbers,
        variables: templateVars,
        header_media_id: headerMediaId || undefined,
        retry_enabled: retryEnabled,
        retry_window_hours: retryWindow,
      });

      if (res.success) {
        if ((res as any).duplicate) {
          alert('This exact campaign is already sending — the duplicate launch was ignored.');
        } else {
          alert(`Campaign queued for ${(res as any).total_recipients} recipients. Sending runs in the background — you can close this page; progress updates live in the list below.`);
        }
        setShowCreateModal(false);
        setCampaignName('');
        setSelectedTemplateId('');
        setPhoneNumbersInput('');
        setSelectedTags([]);
        setHeaderMediaId('');
        setHeaderMediaName('');
        setRetryEnabled(false);
        setTestNote('');
        loadData();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to dispatch broadcast campaign');
    } finally {
      setDispatching(false);
    }
  };

  const totalSent = broadcasts.reduce((acc, b) => acc + (b.sent_count || 0), 0);
  const totalDelivered = broadcasts.reduce((acc, b) => acc + (b.delivered_count || 0), 0);
  const totalRead = broadcasts.reduce((acc, b) => acc + (b.read_count || 0), 0);
  const deliveryRate = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 100;
  const readRate = totalDelivered > 0 ? Math.round((totalRead / totalDelivered) * 100) : 0;

  const selectedTpl = templates.find((t) => t.id === selectedTemplateId);

  return (
    <div className="page-container">
      {/* 1. Top 4 KPI Cards */}
      <div className="metric-cards-grid">
        <div className="saas-kpi-card">
          <div className="kpi-header">
            <Radio size={15} style={{ color: 'var(--text-muted)' }} />
            <span>Total Campaigns</span>
          </div>
          <div className="kpi-body">
            <span className="kpi-number">{broadcasts.length}</span>
            <span className="badge-growth positive">Active</span>
          </div>
        </div>

        <div className="saas-kpi-card">
          <div className="kpi-header">
            <Send size={15} style={{ color: 'var(--text-muted)' }} />
            <span>Messages Sent</span>
          </div>
          <div className="kpi-body">
            <span className="kpi-number">{totalSent}</span>
            <span className="badge-growth positive">+4.2% ↑</span>
          </div>
        </div>

        <div className="saas-kpi-card">
          <div className="kpi-header">
            <CheckCheck size={15} style={{ color: 'var(--text-muted)' }} />
            <span>Delivery Rate</span>
          </div>
          <div className="kpi-body">
            <span className="kpi-number">{deliveryRate}%</span>
            <span className="badge-growth positive">Optimal</span>
          </div>
        </div>

        <div className="saas-kpi-card">
          <div className="kpi-header">
            <Percent size={15} style={{ color: 'var(--text-muted)' }} />
            <span>Open & Read Rate</span>
          </div>
          <div className="kpi-body">
            <span className="kpi-number">{readRate}%</span>
            <span className="badge-growth positive">Verified</span>
          </div>
        </div>
      </div>

      {/* 2. Action Header (Single clean trigger button) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
            Campaign Dispatches
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Bulk WhatsApp template messages dispatched to your segmented audiences.
          </p>
        </div>

        <button onClick={() => setShowCreateModal(true)} className="btn-pitch">
          <Plus size={15} />
          <span>New Broadcast Campaign</span>
        </button>
      </div>

      {/* 3. Campaigns Table inside saas-card */}
      <div className="saas-card" style={{ padding: '0', overflow: 'hidden' }}>
        {broadcasts.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Radio size={42} style={{ color: 'var(--accent-peach)', margin: '0 auto 12px', opacity: 0.8 }} />
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
              No Broadcast Campaigns Yet
            </div>
            <p style={{ fontSize: '13px', maxWidth: '380px', margin: '0 auto 16px' }}>
              Create targeted campaigns to reach your audience with approved WhatsApp templates.
            </p>
            <button onClick={() => setShowCreateModal(true)} className="btn-pitch">
              + Launch First Campaign
            </button>
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
            <table className="saas-table">
              <thead>
                <tr>
                  <th>Campaign Name</th>
                  <th>Template</th>
                  <th>Audience</th>
                  <th>Recipients</th>
                  <th>Delivery Progress</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {broadcasts.map((b) => {
                  const deliveryPct = b.total_recipients > 0
                    ? Math.round((b.sent_count / b.total_recipients) * 100)
                    : 0;
                  const readPct = (b.delivered_count || 0) > 0 ? Math.round(((b.read_count || 0) / b.delivered_count) * 100) : 0;
                  const failPct = b.total_recipients > 0 ? Math.round(((b.failed_count || 0) / b.total_recipients) * 100) : 0;

                  return (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 700 }}>{b.name}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <FileText size={13} style={{ color: 'var(--text-muted)' }} />
                          <span>{b.template_name}</span>
                        </span>
                      </td>
                      <td>
                        {b.target_tags && b.target_tags.length > 0 ? (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {b.target_tags.map((t, idx) => (
                              <span key={idx} className="filter-chip" style={{ padding: '2px 7px', fontSize: '11px' }}>
                                {t}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>All Contacts</span>
                        )}
                      </td>
                      <td>
                        <strong>{b.total_recipients}</strong> contacts
                      </td>
                      <td style={{ minWidth: '150px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                          <span>{b.sent_count} sent</span>
                          <span style={{ color: '#16a34a' }}>{b.delivered_count} delivered</span>
                        </div>
                        <div
                          style={{
                            height: '5px',
                            background: '#e2e8f0',
                            borderRadius: '3px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${deliveryPct}%`,
                              background: b.failed_count > 0 ? 'var(--accent-coral)' : '#16a34a',
                              borderRadius: '3px',
                            }}
                          />
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          📖 {readPct}% read • 💬 {b.replies_count || 0} replies • ❌ {failPct}% failed
                          {b.retry_enabled ? <span> • 🔁 retry {b.retry_window_hours}h</span> : null}
                        </div>
                      </td>
                      <td>
                        <span className="status-tag completed">
                          {b.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {new Date(b.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <button
                          onClick={() => handleViewDetails(b.id)}
                          className="btn-secondary"
                          style={{ padding: '4px 9px', fontSize: '11.5px' }}
                        >
                          <Eye size={12} />
                          <span>Details</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: New Campaign Creator */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Launch New WhatsApp Broadcast Campaign"
      >
        <form onSubmit={handleLaunchCampaign} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
              Campaign Identifier
            </label>
            <input
              type="text"
              placeholder="e.g. VIP Customer Summer Offer"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              required
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
              Select Approved WhatsApp Template
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => {
                setSelectedTemplateId(e.target.value);
                const found = templates.find((t) => t.id === e.target.value);
                const matches = found?.body_text?.match(/{{\d+}}/g) || [];
                setTemplateVars(new Array(matches.length).fill(''));
                setHeaderMediaId('');
                setHeaderMediaName('');
              }}
              required
              style={{ width: '100%' }}
            >
              <option value="">-- Choose an approved template --</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} ({tpl.language} • {tpl.category})
                </option>
              ))}
            </select>
          </div>

          {selectedTpl && (
            <div style={{ background: 'var(--bg-panel)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 700, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                Template Body:
              </div>
              <div style={{ fontSize: '12.5px', whiteSpace: 'pre-wrap', color: 'var(--text-primary)', marginBottom: '10px' }}>
                {selectedTpl.body_text}
              </div>

              {templateVars.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid var(--border-light)', paddingTop: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700 }}>Map Parameters (e.g. {"{{name}}"}):</div>
                  {templateVars.map((v, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', width: '36px' }}>
                        {`{{${i + 1}}}`}:
                      </span>
                      <input
                        type="text"
                        placeholder={`Value for parameter ${i + 1}`}
                        value={v}
                        onChange={(e) => {
                          const updated = [...templateVars];
                          updated[i] = e.target.value;
                          setTemplateVars(updated);
                        }}
                        style={{ flex: 1, padding: '6px 10px' }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selectedTpl.header_type || '') && (
                <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '8px', marginTop: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                    Header {String(selectedTpl.header_type).toLowerCase()} (required for this template):
                  </div>
                  <input
                    type="file"
                    accept={selectedTpl.header_type === 'IMAGE' ? 'image/*' : selectedTpl.header_type === 'VIDEO' ? 'video/*' : '.pdf,.doc,.docx'}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleHeaderMediaUpload(f);
                    }}
                    style={{ width: '100%', fontSize: '12px' }}
                  />
                  {headerUploading && <div style={{ fontSize: '12px', marginTop: '4px' }}>Uploading to Meta…</div>}
                  {headerMediaId && !headerUploading && (
                    <div style={{ fontSize: '12px', marginTop: '4px', color: '#0a7d43' }}>✓ Attached: {headerMediaName}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {selectedTpl && (
            <div style={{ background: 'var(--bg-panel)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 700, marginBottom: '6px' }}>Send a test first (recommended):</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="Test number with country code"
                  style={{ flex: 1, padding: '6px 10px', fontSize: '12.5px' }}
                />
                <button type="button" onClick={handleTestSend} disabled={testSending} className="btn-secondary" style={{ padding: '6px 14px', fontSize: '12.5px' }}>
                  {testSending ? 'Sending…' : 'Send Test'}
                </button>
              </div>
              {testNote && <div style={{ fontSize: '12px', marginTop: '6px' }}>{testNote}</div>}
            </div>
          )}

          <div style={{ background: 'var(--bg-panel)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            <label style={{ fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={retryEnabled}
                onChange={(e) => setRetryEnabled(e.target.checked)}
              />
              Auto-retry failed messages
            </label>
            {retryEnabled && (
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Keep retrying failures for</span>
                <select value={retryWindow} onChange={(e) => setRetryWindow(Number(e.target.value))} style={{ padding: '5px 8px', fontSize: '12.5px' }}>
                  <option value={6}>6 hours</option>
                  <option value={24}>24 hours</option>
                  <option value={48}>48 hours</option>
                  <option value={72}>72 hours</option>
                </select>
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>(checked every 30 min, max 10 attempts each)</span>
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              Audience Targeting
            </label>
            <div style={{ display: 'flex', gap: '14px', marginBottom: '8px' }}>
              <label style={{ fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="targetType"
                  checked={targetType === 'all'}
                  onChange={() => setTargetType('all')}
                />
                <span>All Opted-in</span>
              </label>

              <label style={{ fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="targetType"
                  checked={targetType === 'tags'}
                  onChange={() => setTargetType('tags')}
                />
                <span>By Tags</span>
              </label>

              <label style={{ fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="targetType"
                  checked={targetType === 'numbers'}
                  onChange={() => setTargetType('numbers')}
                />
                <span>Paste Numbers</span>
              </label>
            </div>

            {targetType === 'tags' && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '8px', background: 'var(--bg-panel)', borderRadius: '6px' }}>
                {tags.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <button
                      type="button"
                      key={tag}
                      onClick={() => {
                        if (isSelected) setSelectedTags(selectedTags.filter((t) => t !== tag));
                        else setSelectedTags([...selectedTags, tag]);
                      }}
                      className={`filter-chip ${isSelected ? 'active' : ''}`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            )}

            {targetType === 'numbers' && (
              <textarea
                rows={3}
                placeholder="Paste phone numbers separated by comma or new lines..."
                value={phoneNumbersInput}
                onChange={(e) => setPhoneNumbersInput(e.target.value)}
                style={{ width: '100%', fontSize: '12px' }}
              />
            )}
          </div>

          <div className="modal-footer" style={{ margin: '8px -24px -24px -24px' }}>
            <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={dispatching || !selectedTemplateId} className="btn-pitch">
              {dispatching ? 'Dispatching...' : 'Launch Broadcast'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Broadcast Log */}
      <Modal
        isOpen={Boolean(selectedBroadcast)}
        onClose={() => setSelectedBroadcast(null)}
        title={`Campaign Details: ${selectedBroadcast?.name || ''}`}
      >
        {selectedBroadcast && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', textAlign: 'center' }}>
              <div style={{ background: 'var(--bg-panel)', padding: '10px', borderRadius: '8px' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>RECIPIENTS</div>
                <div style={{ fontSize: '18px', fontWeight: 800 }}>{selectedBroadcast.total_recipients}</div>
              </div>
              <div style={{ background: 'var(--bg-panel)', padding: '10px', borderRadius: '8px' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>SENT</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent-peach-hover)' }}>{selectedBroadcast.sent_count}</div>
              </div>
              <div style={{ background: 'var(--bg-panel)', padding: '10px', borderRadius: '8px' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>DELIVERED</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#16a34a' }}>{selectedBroadcast.delivered_count}</div>
              </div>
              <div style={{ background: 'var(--bg-panel)', padding: '10px', borderRadius: '8px' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>READ</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#4a8bf6' }}>{selectedBroadcast.read_count}</div>
              </div>
            </div>

            {analytics && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', textAlign: 'center' }}>
                <div style={{ background: 'var(--bg-panel)', padding: '10px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>FAILED</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#dc2626' }}>{analytics.failed} ({analytics.fail_rate}%)</div>
                </div>
                <div style={{ background: 'var(--bg-panel)', padding: '10px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>REPLIES</div>
                  <div style={{ fontSize: '16px', fontWeight: 800 }}>{analytics.replies} ({analytics.reply_rate}%)</div>
                </div>
                <div style={{ background: 'var(--bg-panel)', padding: '10px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>DELIVERY RATE</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#16a34a' }}>{analytics.delivery_rate}%</div>
                </div>
                <div style={{ background: 'var(--bg-panel)', padding: '10px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>READ RATE</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#4a8bf6' }}>{analytics.read_rate}%</div>
                </div>
                <div style={{ background: 'var(--bg-panel)', padding: '10px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>IN FLIGHT</div>
                  <div style={{ fontSize: '16px', fontWeight: 800 }}>{analytics.in_flight}</div>
                </div>
                <div style={{ background: 'var(--bg-panel)', padding: '10px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>AUTO-RETRY</div>
                  <div style={{ fontSize: '16px', fontWeight: 800 }}>{selectedBroadcast.retry_enabled ? `ON • ${selectedBroadcast.retry_window_hours}h` : 'OFF'}</div>
                </div>
              </div>
            )}

            <div className="table-container" style={{ maxHeight: '300px' }}>
              <table className="saas-table">
                <thead>
                  <tr>
                    <th>Contact</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r) => (
                    <tr key={r.id}>
                      <td>{r.contact_name || 'Customer'}</td>
                      <td>+{r.phone_number}</td>
                      <td>
                        <span className={`status-tag ${r.status === 'read' || r.status === 'delivered' || r.status === 'sent' ? 'completed' : 'failed'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {r.sent_at ? new Date(r.sent_at).toLocaleTimeString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
