import React from 'react';
import { useWaba } from '../context/WabaContext';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  MessageSquare,
  Workflow,
  Bot,
  Radio,
  FileText,
  Users,
  Settings,
  Activity,
  LogOut,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, unreadCount } = useWaba();
  const { user, logout } = useAuth();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inbox', label: 'Live Chats', icon: MessageSquare, badge: unreadCount },
    { id: 'flows', label: 'Meta Flows', icon: Workflow },
    { id: 'chatbot', label: 'Chatbot Builder', icon: Bot },
    { id: 'broadcasts', label: 'Broadcasts', icon: Radio },
    { id: 'templates', label: 'Templates', icon: FileText },
    { id: 'contacts', label: 'Contacts', icon: Users },
  ];

  return (
    <aside className="saas-sidebar">
      {/* Brand — real product mark (was a placeholder "In" copied from a mockup) */}
      <button
        onClick={() => setActiveTab('dashboard')}
        className="sidebar-brand"
        aria-label="VibeChat — go to Dashboard"
      >
        <span className="sidebar-logo" style={{ backgroundColor: 'var(--accent-emerald)', margin: 0 }}>
          <MessageSquare size={20} />
        </span>
        <span className="sidebar-brand-text">
          <span className="sidebar-brand-name">VibeChat</span>
          <span className="sidebar-brand-sub">Bytenex • WhatsApp</span>
        </span>
      </button>

      {/* Nav — visible labels, not icon-only guesswork */}
      <nav className="sidebar-nav-stack" aria-label="Primary">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`sidebar-icon-btn ${isActive ? 'active' : ''}`}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              title={item.label}
            >
              <Icon size={19} style={{ flexShrink: 0 }} />
              <span className="sidebar-nav-label">{item.label}</span>
              {Boolean(item.badge && item.badge > 0) && (
                <span className="sidebar-badge-count" aria-label={`${item.badge} unread`}>
                  {item.badge! > 99 ? '99+' : item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Stack */}
      <div className="sidebar-footer-stack">
        <button
          onClick={() => setActiveTab('logs')}
          className={`sidebar-icon-btn ${activeTab === 'logs' ? 'active' : ''}`}
          aria-label="Activity Logs"
          aria-current={activeTab === 'logs' ? 'page' : undefined}
          title="Webhook & Activity Logs"
        >
          <Activity size={18} style={{ flexShrink: 0 }} />
          <span className="sidebar-nav-label">Activity Logs</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`sidebar-icon-btn ${activeTab === 'settings' ? 'active' : ''}`}
          aria-label="Settings"
          aria-current={activeTab === 'settings' ? 'page' : undefined}
          title="Platform Settings"
        >
          <Settings size={18} style={{ flexShrink: 0 }} />
          <span className="sidebar-nav-label">Settings</span>
        </button>

        <div className="sidebar-user-row" title={`Admin: ${user?.email || 'contact@bytenex.io'}`}>
          <div className="user-avatar-circle">BN</div>
          <span className="sidebar-nav-label sidebar-user-email">
            {user?.email || 'contact@bytenex.io'}
          </span>
        </div>

        <button
          onClick={logout}
          className="sidebar-icon-btn"
          aria-label="Log out"
          title="Log Out"
        >
          <LogOut size={17} style={{ flexShrink: 0 }} />
          <span className="sidebar-nav-label">Log out</span>
        </button>
      </div>
    </aside>
  );
};
