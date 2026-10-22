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
  Bell,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, unreadCount } = useWaba();
  const { user, logout } = useAuth();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inbox', label: 'Live Chats', icon: MessageSquare, badge: unreadCount },
    { id: 'flows', label: 'Visual Meta Flows', icon: Workflow },
    { id: 'chatbot', label: 'Chatbot Builder', icon: Bot },
    { id: 'broadcasts', label: 'Broadcasts', icon: Radio },
    { id: 'templates', label: 'Templates', icon: FileText },
    { id: 'contacts', label: 'Contacts', icon: Users },
  ];

  return (
    <aside className="saas-sidebar">
      {/* Top Brand Logo - Like 'In' in screenshot */}
      <button
        onClick={() => setActiveTab('dashboard')}
        className="sidebar-logo"
        title="ByteNex WABA Platform"
      >
        In
      </button>

      {/* Nav Icons Stack */}
      <nav className="sidebar-nav-stack">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`sidebar-icon-btn ${isActive ? 'active' : ''}`}
              title={item.label}
            >
              <Icon size={20} />
              {Boolean(item.badge && item.badge > 0) && (
                <span className="sidebar-badge-dot" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Stack (Bell, Settings, User Avatar) */}
      <div className="sidebar-footer-stack">
        <button
          onClick={() => setActiveTab('logs')}
          className={`sidebar-icon-btn ${activeTab === 'logs' ? 'active' : ''}`}
          title="Webhook & Activity Logs"
        >
          <Activity size={18} />
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`sidebar-icon-btn ${activeTab === 'settings' ? 'active' : ''}`}
          title="Platform Settings"
        >
          <Settings size={18} />
        </button>

        <div
          className="user-avatar-circle"
          title={`Admin: ${user?.email || 'contact@bytenex.io'}`}
        >
          BN
        </div>

        <button
          onClick={logout}
          className="sidebar-icon-btn"
          style={{ width: '32px', height: '32px', color: 'var(--text-muted)' }}
          title="Log Out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
};
