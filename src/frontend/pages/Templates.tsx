import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { PhonePreview } from '../components/PhonePreview';
import { Modal } from '../components/Modal';
import {
  FileText,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  XCircle,
  Eye,
  Sparkles,
} from 'lucide-react';

interface Template {
  id: string;
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED';
  header_type?: 'NONE' | 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO';
  header_content?: string;
  body_text: string;
  footer_text?: string;
  buttons_json: any[];
  synced_at: string;
}

export const Templates: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedPreview, setSelectedPreview] = useState<Template | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Template Form
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'MARKETING' | 'UTILITY' | 'AUTHENTICATION'>('MARKETING');
  const [language, setLanguage] = useState('en_US');
  const [headerType, setHeaderType] = useState<'NONE' | 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO'>('NONE');
  const [headerContent, setHeaderContent] = useState('');
  const [bodyText, setBodyText] = useState('Hello {{1}}, welcome to ByteNex! Your verification code is {{2}}.');
  const [footerText, setFooterText] = useState('Reply STOP to unsubscribe');
  const [buttons, setButtons] = useState<any[]>([
    { type: 'QUICK_REPLY', text: 'Confirm' },
    { type: 'URL', text: 'Visit Website', url: 'https://bytenex.io' },
  ]);
  const [creating, setCreating] = useState(false);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const res = await api.templates.list({
        category: categoryFilter === 'all' ? undefined : categoryFilter,
      });
      if (res.success) {
        setTemplates(res.templates);
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, [categoryFilter]);

  const handleSync = async () => {
    try {
      setSyncing(true);
      const res = await api.templates.sync();
      if (res.success) {
        alert(`Successfully synced ${res.count} template(s) from Meta Graph API!`);
        loadTemplates();
      }
    } catch (err: any) {
      alert(err.message || 'Meta template sync failed. Please check credentials in Settings.');
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (id: string, tplName: string) => {
    if (!confirm(`Are you sure you want to delete template "${tplName}"?`)) return;
    try {
      await api.templates.delete(id);
      loadTemplates();
    } catch (err: any) {
      alert(err.message || 'Failed to delete template');
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !bodyText.trim()) return;

    try {
      setCreating(true);
      const res = await api.templates.create({
        name,
        category,
        language,
        header_type: headerType,
        header_content: headerType === 'TEXT' ? headerContent : undefined,
        body_text: bodyText,
        footer_text: footerText,
        buttons,
      });

      if (res.success) {
        setShowCreateModal(false);
        setName('');
        setBodyText('');
        setFooterText('');
        loadTemplates();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create template');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page-container">
      {/* Top Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        {/* Category Filters */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['all', 'MARKETING', 'UTILITY', 'AUTHENTICATION'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`filter-chip ${categoryFilter === cat ? 'active' : ''}`}
            >
              {cat === 'all' ? 'All Categories' : cat.charAt(0) + cat.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Sync & Create Actions */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="btn-secondary"
            title="Sync latest templates from Meta"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            <span>{syncing ? 'Syncing...' : 'Sync Meta Templates'}</span>
          </button>
          <button onClick={() => setShowCreateModal(true)} className="btn-pitch">
            <Plus size={15} />
            <span>+ Create Template</span>
          </button>
        </div>
      </div>

      {/* Templates Grid */}
      {templates.length === 0 ? (
        <div className="saas-card" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
          <FileText size={42} style={{ color: 'var(--accent-peach)', margin: '0 auto 12px', opacity: 0.8 }} />
          <h3 style={{ fontSize: '16px', color: 'var(--text-primary)', fontWeight: 700, marginBottom: '4px' }}>
            No WhatsApp Templates Found
          </h3>
          <p style={{ maxWidth: '380px', margin: '0 auto 16px', fontSize: '13px' }}>
            Sync your pre-approved templates from Meta or create a new one to submit for approval.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button onClick={handleSync} className="btn-secondary">
              Sync from Meta
            </button>
            <button onClick={() => setShowCreateModal(true)} className="btn-pitch">
              + Create Template
            </button>
          </div>
        </div>
      ) : (
        <div className="templates-grid">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="saas-card animate-pop"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {tpl.name}
                    </h3>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {tpl.language} • {tpl.category}
                    </div>
                  </div>

                  <span className={`status-tag ${tpl.status === 'APPROVED' ? 'completed' : tpl.status === 'PENDING' ? 'pending' : 'failed'}`}>
                    {tpl.status === 'APPROVED' && <CheckCircle2 size={11} />}
                    {tpl.status === 'PENDING' && <Clock size={11} />}
                    {tpl.status === 'REJECTED' && <XCircle size={11} />}
                    <span>{tpl.status}</span>
                  </span>
                </div>

                {tpl.header_content && (
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    [{tpl.header_type}]: {tpl.header_content}
                  </div>
                )}

                <div
                  style={{
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    background: 'var(--bg-panel)',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '120px',
                    overflowY: 'auto',
                    lineHeight: '1.45',
                  }}
                >
                  {tpl.body_text}
                </div>

                {tpl.footer_text && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    {tpl.footer_text}
                  </div>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '16px',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--border-light)',
                }}
              >
                <button
                  onClick={() => setSelectedPreview(tpl)}
                  className="btn-secondary"
                  style={{ padding: '5px 12px', fontSize: '12px' }}
                >
                  <Eye size={13} />
                  <span>Preview Phone Mockup</span>
                </button>

                <button
                  onClick={() => handleDelete(tpl.id, tpl.name)}
                  className="btn-icon"
                  style={{ color: 'var(--accent-coral)' }}
                  title="Delete Template"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Phone Mockup */}
      <Modal
        isOpen={Boolean(selectedPreview)}
        onClose={() => setSelectedPreview(null)}
        title={`Template Preview: ${selectedPreview?.name || ''}`}
      >
        {selectedPreview && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <PhonePreview
              headerType={selectedPreview.header_type}
              headerContent={selectedPreview.header_content}
              bodyText={selectedPreview.body_text}
              footerText={selectedPreview.footer_text}
              buttons={selectedPreview.buttons_json}
              variableValues={{ '1': 'Alex', '2': 'BYTENEX20' }}
            />
          </div>
        )}
      </Modal>

      {/* Modal: Create Template */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New WhatsApp Template (Meta Submission)"
      >
        <form onSubmit={handleCreateTemplate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Template Name
              </label>
              <input
                type="text"
                placeholder="e.g. promo_offer_2026"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                required
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                style={{ width: '100%' }}
              >
                <option value="MARKETING">Marketing (Promos & Offers)</option>
                <option value="UTILITY">Utility (Order & Account Alerts)</option>
                <option value="AUTHENTICATION">Authentication (OTPs & Codes)</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
              Body Text
            </label>
            <textarea
              rows={4}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              required
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
              Footer Text (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Reply STOP to opt out"
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div className="modal-footer" style={{ margin: '8px -24px -24px -24px' }}>
            <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={creating} className="btn-pitch">
              {creating ? 'Submitting...' : 'Submit to Meta'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
