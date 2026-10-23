import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { useWaba } from '../context/WabaContext';
import { Modal } from '../components/Modal';
import {
  Search,
  Send,
  Paperclip,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  FileText,
  User,
  ShieldAlert,
  Sparkles,
  Phone,
  Info,
  Plus,
  ArrowLeft,
} from 'lucide-react';

interface Conversation {
  id: string;
  contact_id: string;
  contact_phone: string;
  contact_name?: string;
  last_message_text?: string;
  last_message_at: string;
  unread_count: number;
  is_pinned: number;
  status: 'open' | 'resolved' | 'pending';
  tags: string[];
  is_window_open: boolean;
  window_expires_at: string | null;
  window_seconds_remaining: number;
}

interface Message {
  id: string;
  conversation_id: string;
  wamid?: string;
  direction: 'inbound' | 'outbound';
  type: string;
  content: string;
  media_url?: string;
  media_caption?: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  error_message?: string;
  created_at: string;
}

export const ChatInbox: React.FC = () => {
  const { setUnreadCount, playNotificationSound } = useWaba();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved' | 'pending'>('all');
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);

  // New Chat Form
  const [newChatPhone, setNewChatPhone] = useState('');
  const [newChatName, setNewChatName] = useState('');
  const [newChatMsg, setNewChatMsg] = useState('');

  // Selected Template
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [templateVars, setTemplateVars] = useState<string[]>([]);
  const [tplHeaderMediaId, setTplHeaderMediaId] = useState('');
  const [tplHeaderMediaName, setTplHeaderMediaName] = useState('');
  const [tplHeaderUploading, setTplHeaderUploading] = useState(false);

  const handleTplHeaderMediaUpload = async (file: File) => {
    try {
      setTplHeaderUploading(true);
      const res = await api.broadcasts.uploadHeaderMedia(file);
      if (res.success) {
        setTplHeaderMediaId(res.media_id);
        setTplHeaderMediaName(res.filename || file.name);
      }
    } catch (err: any) {
      alert(err.message || 'Header media upload failed');
      setTplHeaderMediaId('');
      setTplHeaderMediaName('');
    } finally {
      setTplHeaderUploading(false);
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const lastMessagesSigRef = useRef('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sessionKeepRef = useRef<Set<string>>(new Set());

  const loadConversations = async (silent = false) => {
    try {
      const res = await api.chats.list({
        q: searchQuery,
        status: statusFilter === 'all' ? undefined : statusFilter,
      });
      if (res.success) {
        // Remember every chat that arrived with unread messages, plus the
        // open one. Once a chat is read it loses its unread-first rank and
        // falls out of the 100-row page — without this retention the chat
        // being read vanished from the list seconds after opening it.
        res.conversations.forEach((c) => {
          if (c.unread_count > 0) sessionKeepRef.current.add(c.id);
        });
        if (activeConvId) sessionKeepRef.current.add(activeConvId);
        setConversations((prev) => {
          const freshIds = new Set(res.conversations.map((c) => c.id));
          const retained = prev
            .filter((c) => sessionKeepRef.current.has(c.id) && !freshIds.has(c.id))
            .slice(0, 25);
          if (retained.length === 0) return res.conversations;
          const unreadPart = res.conversations.filter((c) => c.unread_count > 0);
          const restPart = res.conversations.filter((c) => !(c.unread_count > 0));
          return [...unreadPart, ...retained, ...restPart];
        });
        const totalUnread = res.conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
        setUnreadCount(totalUnread);

        if (!activeConvId && res.conversations.length > 0 && !silent) {
          setActiveConvId(res.conversations[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  };

  const loadMessages = async (convId: string, markRead = true) => {
    try {
      const res = await api.chats.getMessages(convId);
      if (res.success) {
        // Skip the state update when nothing actually changed — the 3.5s poll
        // otherwise re-renders the thread and yanked the scroll to the bottom
        // while the user was reading older messages.
        const sig = res.messages.map((m: any) => `${m.id}:${m.status}`).join('|');
        if (sig !== lastMessagesSigRef.current) {
          lastMessagesSigRef.current = sig;
          setMessages(res.messages);
        }
        if (markRead) {
          api.chats.markAsRead(convId).catch(() => {});
          setConversations((prev) =>
            prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c))
          );
        }
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    if (activeConvId) {
      lastMessagesSigRef.current = '';
      stickToBottomRef.current = true;
      loadMessages(activeConvId);
    }
  }, [activeConvId]);

  // Real-time polling. searchQuery/statusFilter are dependencies on purpose:
  // without them the interval kept a stale closure and overwrote the user's
  // search results with the full list every 3.5 seconds.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      loadConversations(true);
      if (activeConvId) {
        loadMessages(activeConvId, false);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [activeConvId, searchQuery, statusFilter]);

  // Only follow the tail when the user is already near the bottom; never
  // yank the scroll while they are reading older messages.
  useEffect(() => {
    if (stickToBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages]);

  useEffect(() => {
    api.templates.list({ status: 'APPROVED' }).then((res) => {
      if (res.success) setTemplates(res.templates);
    }).catch(() => {});
  }, []);

  const activeConv = conversations.find((c) => c.id === activeConvId);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeConvId || !inputText.trim() || sending) return;

    const text = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      const res = await api.chats.sendMessage(activeConvId, {
        type: 'text',
        text,
      });

      if (res.success) {
        stickToBottomRef.current = true;
        setMessages((prev) => [...prev, res.message]);
        playNotificationSound();
        loadConversations(true);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConvId) return;

    try {
      setSending(true);
      const uploadRes = await api.media.upload(file);
      if (uploadRes.success) {
        let type: any = 'document';
        if (file.type.startsWith('image/')) type = 'image';
        else if (file.type.startsWith('audio/')) type = 'audio';
        else if (file.type.startsWith('video/')) type = 'video';

        const sendRes = await api.chats.sendMessage(activeConvId, {
          type,
          mediaUrl: uploadRes.url,
          mediaCaption: file.name,
        });

        if (sendRes.success) {
          stickToBottomRef.current = true;
          setMessages((prev) => [...prev, sendRes.message]);
          loadConversations(true);
        }
      }
    } catch (err: any) {
      alert('Media upload failed: ' + err.message);
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSendTemplate = async () => {
    if (!activeConvId || !selectedTemplate) return;

    const isMediaHeader = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selectedTemplate.header_type || '');
    if (isMediaHeader && !tplHeaderMediaId) {
      alert(`This template has a ${String(selectedTemplate.header_type).toLowerCase()} header — please upload the header media first, otherwise the send will fail.`);
      return;
    }

    try {
      setSending(true);
      const components: any[] = [];
      if (isMediaHeader && tplHeaderMediaId) {
        const ht = String(selectedTemplate.header_type).toLowerCase();
        components.push({
          type: 'header',
          parameters: [{ type: ht, [ht]: { id: tplHeaderMediaId } }],
        });
      }
      if (templateVars.length > 0) {
        components.push({
          type: 'body',
          parameters: templateVars.map((v) => ({ type: 'text', text: v })),
        });
      }

      const res = await api.chats.sendMessage(activeConvId, {
        type: 'template',
        template: {
          name: selectedTemplate.name,
          language: { code: selectedTemplate.language || 'en_US' },
          components: components.length > 0 ? components : undefined,
        },
      });

      if (res.success) {
        stickToBottomRef.current = true;
        setMessages((prev) => [...prev, res.message]);
        setShowTemplateModal(false);
        setSelectedTemplate(null);
        setTemplateVars([]);
        setTplHeaderMediaId('');
        setTplHeaderMediaName('');
        loadConversations(true);
      }
    } catch (err: any) {
      alert(err.message || 'Template dispatch failed');
    } finally {
      setSending(false);
    }
  };

  const handleStartNewChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatPhone) return;

    try {
      const res = await api.chats.start({
        phone_number: newChatPhone,
        name: newChatName || undefined,
        initial_message: newChatMsg || 'Hello from ByteNex!',
      });

      if (res.success) {
        setShowNewChatModal(false);
        setNewChatPhone('');
        setNewChatName('');
        setNewChatMsg('');
        await loadConversations();
        setActiveConvId(res.conversation_id);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to start conversation');
    }
  };

  const formatCountdown = (seconds: number) => {
    if (seconds <= 0) return 'Window Closed';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m care window`;
  };

  return (
    <div className="chat-page-container">
      {/* 1. Left Sidebar: Conversations List */}
      <div className={`chat-sidebar ${activeConvId ? 'mobile-hidden' : ''}`}>
        {/* Search & New Chat Trigger */}
        <div className="chat-search-bar">
          <div className="search-input-wrapper" style={{ flex: 1 }}>
            <Search size={14} className="search-icon-inside" />
            <input
              type="text"
              placeholder="Search chat or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowNewChatModal(true)}
            className="btn-pitch"
            style={{ padding: '7px 11px', borderRadius: '8px' }}
            title="Start New Chat"
          >
            <Plus size={15} />
          </button>
        </div>

        {/* Filter Chips */}
        <div className="chat-filters">
          {(['all', 'open', 'pending', 'resolved'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`filter-chip ${statusFilter === status ? 'active' : ''}`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {/* Conversations Feed */}
        <div className="chat-list">
          {conversations.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '13.5px', marginBottom: '10px' }}>No conversations found</div>
              <button
                onClick={() => setShowNewChatModal(true)}
                className="btn-secondary"
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                + Start New Chat
              </button>
            </div>
          ) : (
            conversations.map((c) => {
              const isActive = c.id === activeConvId;
              const formattedTime = new Date(c.last_message_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={c.id}
                  onClick={() => setActiveConvId(c.id)}
                  className={`chat-item ${isActive ? 'active' : ''}`}
                >
                  <div className="chat-avatar">
                    {(c.contact_name || c.contact_phone).substring(0, 2).toUpperCase()}
                  </div>
                  <div className="chat-item-content">
                    <div className="chat-item-header">
                      <div className="chat-item-name">{c.contact_name || `+${c.contact_phone}`}</div>
                      <div className="chat-item-time">{formattedTime}</div>
                    </div>
                    <div className="chat-item-preview">
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.last_message_text || 'No messages yet'}
                      </span>
                      {Boolean(c.unread_count && c.unread_count > 0) && (
                        <span className="unread-badge">{c.unread_count}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Middle Pane: Active Conversation Message Stream */}
      {activeConv ? (
        <div className="chat-main">
          {/* Header */}
          <div className="chat-main-header">
            <button
              type="button"
              className="chat-back-mobile-btn"
              onClick={() => setActiveConvId(null)}
              title="Back to conversations"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="chat-header-user">
              <div className="chat-avatar" style={{ width: '36px', height: '36px', fontSize: '13px' }}>
                {(activeConv.contact_name || activeConv.contact_phone).substring(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                  {activeConv.contact_name || `+${activeConv.contact_phone}`}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  +{activeConv.contact_phone}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* WhatsApp 24-Hour Service Window Pill */}
              <div
                className={`service-window-badge ${activeConv.is_window_open ? 'open' : 'closed'}`}
                title={
                  activeConv.is_window_open
                    ? 'Customer sent a message recently. Free-form messaging is allowed.'
                    : 'Customer message is older than 24h. You must use an approved Meta Template to send messages.'
                }
              >
                <Clock size={12} />
                <span>
                  {activeConv.is_window_open
                    ? formatCountdown(activeConv.window_seconds_remaining)
                    : '24h Window Closed'}
                </span>
              </div>

              {/* Status Selector */}
              <select
                value={activeConv.status}
                onChange={async (e) => {
                  const newStatus = e.target.value as any;
                  await api.chats.update(activeConv.id, { status: newStatus });
                  setConversations((prev) =>
                    prev.map((c) => (c.id === activeConv.id ? { ...c, status: newStatus } : c))
                  );
                }}
                style={{ padding: '3px 8px', fontSize: '12px', background: '#ffffff' }}
              >
                <option value="open">Open</option>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
              </select>

              <button
                onClick={() => setShowDrawer(!showDrawer)}
                className="btn-icon"
                title="View Contact Details"
              >
                <Info size={17} />
              </button>
            </div>
          </div>

          {/* Messages Stream */}
          <div
            className="messages-container"
            ref={messagesContainerRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
            }}
          >
            {messages.map((msg) => {
              const isOut = msg.direction === 'outbound';
              const timeStr = new Date(msg.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div key={msg.id} className={`message-bubble ${isOut ? 'outbound' : 'inbound'}`}>
                  {/* Media preview */}
                  {msg.media_url && (
                    <div style={{ marginBottom: '6px' }}>
                      {msg.type === 'image' && (
                        <img
                          src={msg.media_url}
                          alt="Media attachment"
                          style={{ maxWidth: '100%', maxHeight: '220px', borderRadius: '6px' }}
                        />
                      )}
                      {msg.type === 'document' && (
                        <a
                          href={msg.media_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            color: 'inherit',
                            textDecoration: 'underline',
                          }}
                        >
                          <FileText size={15} />
                          <span>{msg.content || 'Download Document'}</span>
                        </a>
                      )}
                      {msg.type === 'audio' && (
                        <audio controls src={msg.media_url} style={{ width: '220px', height: '36px' }} />
                      )}
                    </div>
                  )}

                  {/* Text Content */}
                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>

                  {/* Meta: Timestamp + Delivery Checkmarks */}
                  <div className="message-meta">
                    <span>{timeStr}</span>
                    {isOut && (
                      <span>
                        {msg.status === 'read' && <CheckCheck size={13} className="check-double-blue" />}
                        {msg.status === 'delivered' && <CheckCheck size={13} />}
                        {msg.status === 'sent' && <Check size={13} />}
                        {msg.status === 'pending' && <Clock size={11} />}
                        {msg.status === 'failed' && (
                          <AlertCircle size={13} style={{ color: '#ef4444' }} title={msg.error_message || 'Failed to send'} />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* 24-Hour Window Closed Warning Banner */}
          {!activeConv.is_window_open && (
            <div className="template-required-banner">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={15} />
                <span>
                  The 24h care window is closed. Free-form text cannot be sent per Meta rules.
                </span>
              </div>
              <button
                onClick={() => setShowTemplateModal(true)}
                className="btn-pitch"
                style={{ padding: '4px 10px', fontSize: '11.5px' }}
              >
                Send Approved Template
              </button>
            </div>
          )}

          {/* Chat Input Bar */}
          <form onSubmit={handleSendMessage} className="chat-input-bar">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-icon"
              title="Attach File or Media"
              disabled={sending}
            >
              <Paperclip size={17} />
            </button>

            <button
              type="button"
              onClick={() => setShowTemplateModal(true)}
              className="btn-icon"
              title="Send WhatsApp Template"
            >
              <Sparkles size={17} style={{ color: 'var(--accent-peach-hover)' }} />
            </button>

            <div className="chat-input-wrapper">
              <textarea
                rows={1}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={
                  activeConv.is_window_open
                    ? 'Type a message... (Press Enter to send)'
                    : 'Care window closed. Choose an approved template to continue...'
                }
                className="chat-textarea"
                disabled={sending}
              />
            </div>

            <button
              type="submit"
              disabled={sending || !inputText.trim()}
              className="btn-pitch"
              style={{ width: '38px', height: '38px', padding: 0, borderRadius: '50%', justifyContent: 'center' }}
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      ) : (
        <div
          className="chat-main mobile-hidden"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#fafcfb',
            color: 'var(--text-muted)',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '42px' }}>💬</div>
          <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>
            ByteNex WhatsApp Team Inbox
          </div>
          <p style={{ fontSize: '13px', maxWidth: '340px', textAlign: 'center' }}>
            Select a conversation on the left or click <strong>+</strong> to start a new chat.
          </p>
        </div>
      )}

      {/* 3. Right Pane: Contact Details Drawer */}
      {showDrawer && activeConv && (
        <div
          style={{
            width: '280px',
            backgroundColor: '#ffffff',
            borderLeft: '1px solid var(--border-light)',
            padding: '24px 18px',
            overflowY: 'auto',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <div
              className="chat-avatar"
              style={{ width: '56px', height: '56px', fontSize: '20px', margin: '0 auto 10px' }}
            >
              {(activeConv.contact_name || activeConv.contact_phone).substring(0, 2).toUpperCase()}
            </div>
            <h3 style={{ fontSize: '15px', fontWeight: 800 }}>
              {activeConv.contact_name || `+${activeConv.contact_phone}`}
            </h3>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              +{activeConv.contact_phone}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '12.5px' }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '10.5px', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 700 }}>
                Opt-in Status
              </div>
              <span className="status-tag completed">
                Verified Opt-in
              </span>
            </div>

            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '10.5px', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 700 }}>
                Assigned Tags
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {(activeConv.tags || []).length > 0 ? (
                  activeConv.tags.map((t, idx) => (
                    <span
                      key={idx}
                      style={{
                        background: 'var(--bg-subtle)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      {t}
                    </span>
                  ))
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>No tags</span>
                )}
              </div>
            </div>

            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '10.5px', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 700 }}>
                Care Window Expiry
              </div>
              <div style={{ color: 'var(--text-primary)', fontSize: '12px' }}>
                {activeConv.window_expires_at
                  ? new Date(activeConv.window_expires_at).toLocaleString()
                  : 'Expired / Requires Template'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Start New Chat */}
      <Modal
        isOpen={showNewChatModal}
        onClose={() => setShowNewChatModal(false)}
        title="Start New WhatsApp Chat"
      >
        <form onSubmit={handleStartNewChat} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              Recipient Phone Number (with Country Code)
            </label>
            <input
              type="text"
              placeholder="e.g. 15550192834 or 919876543210"
              value={newChatPhone}
              onChange={(e) => setNewChatPhone(e.target.value)}
              required
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              Contact Name (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. John Doe"
              value={newChatName}
              onChange={(e) => setNewChatName(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              Initial Message
            </label>
            <textarea
              rows={3}
              placeholder="Type initial greeting..."
              value={newChatMsg}
              onChange={(e) => setNewChatMsg(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div className="modal-footer" style={{ margin: '8px -24px -24px -24px' }}>
            <button type="button" onClick={() => setShowNewChatModal(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-pitch">
              Start Conversation
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Select & Send Approved Template */}
      <Modal
        isOpen={showTemplateModal}
        onClose={() => {
          setShowTemplateModal(false);
          setSelectedTemplate(null);
        }}
        title="Send Approved WhatsApp Template"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              Select Template
            </label>
            <select
              value={selectedTemplate?.id || ''}
              onChange={(e) => {
                const found = templates.find((t) => t.id === e.target.value);
                setSelectedTemplate(found || null);
                const matches = found?.body_text?.match(/{{\d+}}/g) || [];
                setTemplateVars(new Array(matches.length).fill(''));
                setTplHeaderMediaId('');
                setTplHeaderMediaName('');
              }}
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

          {selectedTemplate && (
            <div style={{ background: 'var(--bg-panel)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
                Template Preview:
              </div>
              <div style={{ fontSize: '13px', whiteSpace: 'pre-wrap', color: 'var(--text-primary)', marginBottom: '10px' }}>
                {selectedTemplate.body_text}
              </div>

              {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selectedTemplate.header_type || '') && (
                <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '10px', marginTop: '4px' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>
                    Header {String(selectedTemplate.header_type).toLowerCase()} (required — without it this send fails):
                  </div>
                  <input
                    type="file"
                    accept={selectedTemplate.header_type === 'IMAGE' ? 'image/*' : selectedTemplate.header_type === 'VIDEO' ? 'video/*' : '.pdf,.doc,.docx'}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleTplHeaderMediaUpload(f);
                    }}
                    style={{ width: '100%', fontSize: '12px' }}
                  />
                  {tplHeaderUploading && <div style={{ fontSize: '12px', marginTop: '4px' }}>Uploading to Meta…</div>}
                  {tplHeaderMediaId && !tplHeaderUploading && (
                    <div style={{ fontSize: '12px', marginTop: '4px', color: '#0a7d43' }}>✓ Attached: {tplHeaderMediaName}</div>
                  )}
                </div>
              )}

              {templateVars.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px', borderTop: '1px solid var(--border-light)', paddingTop: '10px' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 700 }}>Fill Variables:</div>
                  {templateVars.map((v, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', width: '36px' }}>
                        {`{{${i + 1}}}`}:
                      </span>
                      <input
                        type="text"
                        placeholder={`Value for {{${i + 1}}}`}
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
            </div>
          )}

          <div className="modal-footer" style={{ margin: '8px -24px -24px -24px' }}>
            <button
              type="button"
              onClick={() => {
                setShowTemplateModal(false);
                setSelectedTemplate(null);
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSendTemplate}
              disabled={!selectedTemplate || sending}
              className="btn-pitch"
            >
              {sending ? 'Sending...' : 'Send Template'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
