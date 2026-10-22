import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useWaba } from '../context/WabaContext';
import { Modal } from '../components/Modal';
import {
  Users,
  UserPlus,
  Upload,
  Search,
  MessageSquare,
  Edit2,
  Trash2,
  Tag,
  CheckCircle2,
  XCircle,
  Plus,
} from 'lucide-react';

interface Contact {
  id: string;
  phone_number: string;
  name?: string;
  email?: string;
  tags: string[];
  opt_in_status: 'opted_in' | 'opted_out';
  notes?: string;
  created_at: string;
}

export const Contacts: React.FC = () => {
  const { setActiveTab } = useWaba();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  // Add/Edit Form
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [notes, setNotes] = useState('');
  const [optIn, setOptIn] = useState<'opted_in' | 'opted_out'>('opted_in');

  // Import Form
  const [importText, setImportText] = useState('');
  const [importTag, setImportTag] = useState('Imported');
  const [importing, setImporting] = useState(false);

  const loadContacts = async () => {
    try {
      setLoading(true);
      const [contactsRes, tagsRes] = await Promise.all([
        api.contacts.list({
          q: search,
          tag: selectedTag === 'all' ? undefined : selectedTag,
        }),
        api.contacts.getTags(),
      ]);

      if (contactsRes.success) setContacts(contactsRes.contacts);
      if (tagsRes.success) setTags(tagsRes.tags);
    } catch (err) {
      console.error('Failed to load contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, [search, selectedTag]);

  const handleOpenAdd = () => {
    setEditingContact(null);
    setPhone('');
    setName('');
    setEmail('');
    setTagsInput('');
    setNotes('');
    setOptIn('opted_in');
    setShowAddModal(true);
  };

  const handleOpenEdit = (ct: Contact) => {
    setEditingContact(ct);
    setPhone(ct.phone_number);
    setName(ct.name || '');
    setEmail(ct.email || '');
    setTagsInput(ct.tags.join(', '));
    setNotes(ct.notes || '');
    setOptIn(ct.opt_in_status || 'opted_in');
    setShowAddModal(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return;

    try {
      const parsedTags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      await api.contacts.save({
        id: editingContact?.id,
        phone_number: phone,
        name: name || undefined,
        email: email || undefined,
        tags: parsedTags,
        notes: notes || undefined,
        opt_in_status: optIn,
      });

      setShowAddModal(false);
      loadContacts();
    } catch (err: any) {
      alert(err.message || 'Failed to save contact');
    }
  };

  const handleDelete = async (id: string, ctName: string) => {
    if (!confirm(`Are you sure you want to delete ${ctName}?`)) return;
    try {
      await api.contacts.delete(id);
      loadContacts();
    } catch (err: any) {
      alert(err.message || 'Failed to delete contact');
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importText.trim()) return;

    try {
      setImporting(true);
      const lines = importText.split('\n');
      const importList: any[] = [];

      for (const line of lines) {
        const parts = line.split(/[,\t]+/).map((p) => p.trim());
        if (parts.length > 0 && parts[0].length >= 7) {
          importList.push({
            phone_number: parts[0],
            name: parts[1] || undefined,
            email: parts[2] || undefined,
          });
        }
      }

      if (importList.length === 0) {
        alert('No valid phone numbers found in input');
        return;
      }

      const res = await api.contacts.import({
        contacts: importList,
        default_tags: [importTag || 'Imported'],
      });

      if (res.success) {
        alert(`Successfully imported ${res.count} contact(s)!`);
        setShowImportModal(false);
        setImportText('');
        loadContacts();
      }
    } catch (err: any) {
      alert(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="page-container">
      {/* Top Filter and Action Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          marginBottom: '20px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1, minWidth: '280px' }}>
          <div className="search-input-wrapper" style={{ maxWidth: '320px' }}>
            <Search size={14} className="search-icon-inside" />
            <input
              type="text"
              placeholder="Search contact, phone or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
            style={{ width: '160px', background: '#ffffff' }}
          >
            <option value="all">All Tags ({contacts.length})</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setShowImportModal(true)} className="btn-secondary">
            <Upload size={14} />
            <span>Import CSV / Paste</span>
          </button>
          <button onClick={handleOpenAdd} className="btn-pitch">
            <Plus size={15} />
            <span>+ Add Contact</span>
          </button>
        </div>
      </div>

      {/* Contacts Table wrapped in saas-card */}
      <div className="saas-card" style={{ padding: '0', overflow: 'hidden' }}>
        {contacts.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Users size={42} style={{ color: 'var(--accent-peach)', margin: '0 auto 12px', opacity: 0.8 }} />
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
              No Contacts Found
            </div>
            <p style={{ fontSize: '13px', maxWidth: '380px', margin: '0 auto 16px' }}>
              Add individual contacts or bulk import from CSV to start building your audience.
            </p>
            <button onClick={handleOpenAdd} className="btn-pitch">
              + Add First Contact
            </button>
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
            <table className="saas-table">
              <thead>
                <tr>
                  <th>Contact Name</th>
                  <th>Phone Number</th>
                  <th>Email</th>
                  <th>Tags</th>
                  <th>Opt-in Status</th>
                  <th>Added</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((ct) => (
                  <tr key={ct.id}>
                    <td>
                      <div className="user-cell">
                        <div className="user-cell-avatar">
                          {(ct.name || ct.phone_number).substring(0, 2).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 700 }}>{ct.name || 'Anonymous'}</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12.5px' }}>
                        +{ct.phone_number}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{ct.email || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {ct.tags.length > 0 ? (
                          ct.tags.map((t, i) => (
                            <span key={i} className="filter-chip" style={{ padding: '2px 7px', fontSize: '11px' }}>
                              {t}
                            </span>
                          ))
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`status-tag ${ct.opt_in_status === 'opted_in' ? 'completed' : 'failed'}`}>
                        {ct.opt_in_status === 'opted_in' ? 'Opted In' : 'Opted Out'}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {new Date(ct.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          onClick={() => {
                            api.chats.start({ phone_number: ct.phone_number, name: ct.name }).then(() => {
                              setActiveTab('inbox');
                            });
                          }}
                          className="btn-icon"
                          title="Open WhatsApp Chat"
                        >
                          <MessageSquare size={14} style={{ color: 'var(--accent-emerald)' }} />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(ct)}
                          className="btn-icon"
                          title="Edit Contact"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(ct.id, ct.name || ct.phone_number)}
                          className="btn-icon"
                          style={{ color: 'var(--accent-coral)' }}
                          title="Delete Contact"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Add or Edit Contact */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={editingContact ? 'Edit WhatsApp Contact' : 'Add New Contact'}
      >
        <form onSubmit={handleSaveContact} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
              Phone Number (with Country Code)
            </label>
            <input
              type="text"
              placeholder="e.g. 15550192834 or 919876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              disabled={Boolean(editingContact)}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
              Full Name
            </label>
            <input
              type="text"
              placeholder="e.g. Jane Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
              Email Address
            </label>
            <input
              type="email"
              placeholder="e.g. jane@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
              Tags (Comma separated)
            </label>
            <input
              type="text"
              placeholder="e.g. VIP, Customer, Lead"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div className="modal-footer" style={{ margin: '8px -24px -24px -24px' }}>
            <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-pitch">
              {editingContact ? 'Save Changes' : 'Add Contact'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Bulk Import */}
      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Bulk Import Contacts"
      >
        <form onSubmit={handleImport} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
              Paste Contacts (One per line: phone, name, email)
            </label>
            <textarea
              rows={8}
              placeholder={"+15550192834, Jane Doe, jane@example.com\n+919876543210, John Smith, john@example.com"}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              required
              style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
              Default Tag to Assign
            </label>
            <input
              type="text"
              placeholder="e.g. CampaignLead_2026"
              value={importTag}
              onChange={(e) => setImportTag(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div className="modal-footer" style={{ margin: '8px -24px -24px -24px' }}>
            <button type="button" onClick={() => setShowImportModal(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={importing} className="btn-pitch">
              {importing ? 'Importing...' : 'Start Import'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
