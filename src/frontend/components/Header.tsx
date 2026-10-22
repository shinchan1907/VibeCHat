import React from 'react';
import { useWaba } from '../context/WabaContext';
import { Plus, RefreshCw, ChevronDown, Settings } from 'lucide-react';

interface HeaderProps {
  onActionClick?: () => void;
  actionLabel?: string;
}

export const Header: React.FC<HeaderProps> = ({ onActionClick, actionLabel }) => {
  const { activeTab, setActiveTab, connectionStatus, phoneDetails, refreshConnection } = useWaba();

  const getTitle = () => {
    switch (activeTab) {
      case 'dashboard':
        return 'Dashboard';
      case 'inbox':
        return 'Live Chats';
      case 'flows':
        return 'Visual Meta Flows';
      case 'chatbot':
        return 'Chatbot Builder';
      case 'broadcasts':
        return 'Broadcast Campaigns';
      case 'templates':
        return 'Message Templates';
      case 'contacts':
        return 'Contacts & Audience';
      case 'settings':
        return 'WABA Settings';
      case 'logs':
        return 'Audit Logs';
      default:
        return 'Dashboard';
    }
  };

  const getDefaultActionLabel = () => {
    switch (activeTab) {
      case 'dashboard':
        return '+ New Broadcast';
      case 'flows':
        return '+ New Flow Form';
      case 'chatbot':
        return '+ New Bot Flow';
      case 'broadcasts':
        return '+ New Broadcast';
      case 'templates':
        return '+ Create Template';
      case 'contacts':
        return '+ Add Contact';
      case 'inbox':
        return '+ New Chat';
      default:
        return '+ Action';
    }
  };

  return (
    <header className="saas-topbar">
      <div>
        <h1 className="topbar-title">{getTitle()}</h1>
        {phoneDetails.display_phone_number && (
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Connected Number: <strong>{phoneDetails.display_phone_number}</strong>
          </div>
        )}
      </div>

      <div className="topbar-actions">
        {/* Connection status pill */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: 'var(--radius-full)',
            fontSize: '12px',
            fontWeight: 700,
            backgroundColor: connectionStatus === 'connected' ? 'var(--accent-green-subtle)' : 'var(--accent-coral-subtle)',
            color: connectionStatus === 'connected' ? '#16a34a' : '#dc2626',
          }}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: 'currentColor',
            }}
          />
          <span>{connectionStatus === 'connected' ? 'Meta Live' : 'Sandbox Mode'}</span>
          <button
            onClick={refreshConnection}
            className="btn-icon"
            style={{ width: '18px', height: '18px' }}
            title="Refresh Meta Connection"
          >
            <RefreshCw size={11} />
          </button>
        </div>

        {/* Period Dropdown - Exactly like screenshot */}
        <select className="period-select" defaultValue="last_month">
          <option value="last_month">Last month ▾</option>
          <option value="last_7_days">Last 7 days ▾</option>
          <option value="all_time">All time ▾</option>
        </select>

        {/* Action Button - Only show if onActionClick provided and not duplicated */}
        {onActionClick && actionLabel && (
          <button onClick={onActionClick} className="btn-pitch">
            <span>{actionLabel}</span>
          </button>
        )}

        {/* Quick Settings Icon Button */}
        <button
          onClick={() => setActiveTab('settings')}
          className="btn-icon"
          style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--bg-subtle)' }}
          title="Platform Settings"
        >
          <Settings size={15} />
        </button>
      </div>
    </header>
  );
};
