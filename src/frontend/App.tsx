import React, { useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WabaProvider, useWaba } from './context/WabaContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Login } from './pages/Login';
import { DashboardOverview } from './pages/DashboardOverview';
import { ChatInbox } from './pages/ChatInbox';
import { Broadcasts } from './pages/Broadcasts';
import { Templates } from './pages/Templates';
import { MetaFlows } from './pages/MetaFlows';
import { ChatbotBuilder } from './pages/ChatbotBuilder';
import { Contacts } from './pages/Contacts';
import { Settings } from './pages/Settings';
import { AuditLogs } from './pages/AuditLogs';

const DashboardContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { activeTab, setActiveTab, connectionStatus } = useWaba();
  const [bannerDismissed, setBannerDismissed] = useState(false);

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          height: '100vh',
          width: '100vw',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#edf3f2',
          color: '#172126',
          fontSize: '16px',
          fontWeight: 700,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div className="sidebar-logo" style={{ width: '52px', height: '52px', fontSize: '22px', margin: 0, backgroundColor: 'var(--accent-emerald)' }}>
            <MessageSquare size={26} />
          </div>
          <span>Loading VibeChat...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  const renderActivePage = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardOverview onNewBroadcast={() => setActiveTab('broadcasts')} />;
      case 'inbox':
        return <ChatInbox />;
      case 'flows':
        return <MetaFlows />;
      case 'chatbot':
        return <ChatbotBuilder />;
      case 'broadcasts':
        return <Broadcasts />;
      case 'templates':
        return <Templates />;
      case 'contacts':
        return <Contacts />;
      case 'settings':
        return <Settings />;
      case 'logs':
        return <AuditLogs />;
      default:
        return <DashboardOverview onNewBroadcast={() => setActiveTab('broadcasts')} />;
    }
  };

  const handleHeaderAction = () => {
    switch (activeTab) {
      case 'dashboard':
      case 'broadcasts':
        setActiveTab('broadcasts');
        break;
      case 'flows':
        setActiveTab('flows');
        break;
      case 'chatbot':
        setActiveTab('chatbot');
        break;
      case 'templates':
        setActiveTab('templates');
        break;
      case 'contacts':
        setActiveTab('contacts');
        break;
      case 'inbox':
        setActiveTab('inbox');
        break;
    }
  };

  return (
    <div className="app-canvas">
      <div className="dashboard-window">
        <Sidebar />
        <div className="workspace-wrapper">
          <Header onActionClick={handleHeaderAction} />
          {connectionStatus === 'offline' && !bannerDismissed && activeTab !== 'settings' && (
            <div className="waba-banner" role="status">
              <span>
                <strong>WhatsApp not connected yet.</strong> Add your Phone Number ID and Meta
                access token in Settings — messages, templates and broadcasts go live after that.
              </span>
              <button onClick={() => setActiveTab('settings')}>Open Settings</button>
              <button
                className="waba-banner-dismiss"
                onClick={() => setBannerDismissed(true)}
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          )}
          <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>{renderActivePage()}</main>
        </div>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <WabaProvider>
        <DashboardContent />
      </WabaProvider>
    </AuthProvider>
  );
};

export default App;
