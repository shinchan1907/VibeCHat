import React from 'react';
import { useWaba } from '../context/WabaContext';
import {
  Briefcase,
  Users,
  Send,
  Eye,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  MessageSquare,
  Workflow,
  Radio,
  Clock,
  Sparkles,
} from 'lucide-react';

interface DashboardOverviewProps {
  onNewBroadcast?: () => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({ onNewBroadcast }) => {
  const { setActiveTab } = useWaba();

  return (
    <div className="page-container">
      {/* 1. Top 5 Metric Cards (Exactly like reference image) */}
      <div className="metric-cards-grid">
        {/* KPI 1 */}
        <div className="saas-kpi-card">
          <div className="kpi-header">
            <Briefcase size={15} style={{ color: 'var(--text-muted)' }} />
            <span>Active Chats</span>
          </div>
          <div className="kpi-body">
            <span className="kpi-number">12</span>
            <span className="badge-growth positive">+7.4% ↑</span>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="saas-kpi-card">
          <div className="kpi-header">
            <Users size={15} style={{ color: 'var(--text-muted)' }} />
            <span>Audience Contacts</span>
          </div>
          <div className="kpi-body">
            <span className="kpi-number">940</span>
            <span className="badge-growth positive">+2% ↑</span>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="saas-kpi-card">
          <div className="kpi-header">
            <Send size={15} style={{ color: 'var(--text-muted)' }} />
            <span>Broadcasts Sent</span>
          </div>
          <div className="kpi-body">
            <span className="kpi-number">18</span>
            <span className="badge-growth positive">+3.5% ↑</span>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="saas-kpi-card">
          <div className="kpi-header">
            <Eye size={15} style={{ color: 'var(--text-muted)' }} />
            <span>Open & Read Rate</span>
          </div>
          <div className="kpi-body">
            <span className="kpi-number">72%</span>
            <span className="badge-growth negative">-3% ↓</span>
          </div>
        </div>

        {/* KPI 5 */}
        <div className="saas-kpi-card">
          <div className="kpi-header">
            <CheckCircle size={15} style={{ color: 'var(--text-muted)' }} />
            <span>Flows Completed</span>
          </div>
          <div className="kpi-body">
            <span className="kpi-number">28</span>
            <span className="badge-growth positive">+12% ↑</span>
          </div>
        </div>
      </div>

      {/* 2. Middle Row: Messaging Trends Bar Chart + Radial Performance Donut */}
      <div className="analytics-split-grid">
        {/* Left: Bar Chart ("Revenues and expenses" in screenshot) */}
        <div className="saas-card">
          <div className="saas-card-header">
            <span className="saas-card-title">Messaging and delivery volume</span>
            <button onClick={() => setActiveTab('broadcasts')} className="btn-view-all">
              View all →
            </button>
          </div>

          <div style={{ display: 'flex', gap: '24px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#4a8bf6' }} />
              <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>Delivered:</span>
              <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>7,260 msg</strong>
              <span className="badge-growth positive">+5.2% ↑</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#9fe050' }} />
              <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>Inbound:</span>
              <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>2,523 msg</strong>
              <span className="badge-growth negative">-1.7% ↓</span>
            </div>
          </div>

          {/* Dual Pill Bar Chart */}
          <div className="bar-chart-container">
            {[
              { h1: 30, h2: 70 }, { h1: 45, h2: 30 }, { h1: 20, h2: 50 },
              { h1: 60, h2: 40 }, { h1: 35, h2: 80 }, { h1: 75, h2: 60 },
              { h1: 40, h2: 45 }, { h1: 50, h2: 85 }, { h1: 65, h2: 70 },
              { h1: 30, h2: 40 }, { h1: 85, h2: 65 }, { h1: 55, h2: 90 },
              { h1: 70, h2: 45 }, { h1: 40, h2: 75 }, { h1: 80, h2: 60 },
            ].map((col, idx) => (
              <div key={idx} className="bar-column">
                <div className="bar-pill-top" style={{ height: `${col.h1}%` }} />
                <div className="bar-pill-bottom" style={{ height: `${col.h2}%` }} />
                <span className="bar-label">{(idx + 1) * 2}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Semi-Circle Gauge ("Your Performance" in screenshot) */}
        <div className="saas-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div className="saas-card-header">
            <span className="saas-card-title">Delivery Health</span>
            <button onClick={() => setActiveTab('broadcasts')} className="btn-view-all">
              View all →
            </button>
          </div>

          <div className="gauge-card-content">
            <div className="radial-gauge-container">
              <div className="radial-gauge-arc" />
              <div className="gauge-center-text">
                <div className="gauge-pct">88%</div>
                <div className="gauge-label">Success Rate</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px', marginTop: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f4a860' }} />
                <span>Send 3 broadcasts (2/3)</span>
              </span>
              <Clock size={14} style={{ color: 'var(--text-muted)' }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4a8bf6' }} />
                <span>Meta templates approved (4/4)</span>
              </span>
              <CheckCircle size={14} style={{ color: '#16a34a' }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#9fe050' }} />
                <span>Publish 2 Meta flows (2/2)</span>
              </span>
              <CheckCircle size={14} style={{ color: '#16a34a' }} />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Bottom Row: Active Deals Table + Pending Automation Tasks */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: '20px' }}>
        {/* Left: Active Deals / Customer Conversations Table */}
        <div className="saas-card">
          <div className="saas-card-header">
            <span className="saas-card-title">Active Conversations & Deals</span>
            <button onClick={() => setActiveTab('inbox')} className="btn-view-all">
              View all →
            </button>
          </div>

          <table className="saas-table">
            <thead>
              <tr>
                <th>Customer / Client</th>
                <th>Inquiry & Task</th>
                <th>Care Window</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div className="user-cell">
                    <div className="user-cell-avatar" style={{ background: '#dbeafe', color: '#1e40af' }}>
                      LH
                    </div>
                    <div>
                      <div className="user-cell-name">Lena Harper</div>
                      <div className="user-cell-sub">+1 (555) 019-2834</div>
                    </div>
                  </div>
                </td>
                <td>Requested pricing sheet for enterprise</td>
                <td>18h remaining</td>
                <td>
                  <span className="status-tag in-progress">In progress</span>
                </td>
              </tr>

              <tr>
                <td>
                  <div className="user-cell">
                    <div className="user-cell-avatar" style={{ background: '#fef3c7', color: '#92400e' }}>
                      SK
                    </div>
                    <div>
                      <div className="user-cell-name">Sophie Kim</div>
                      <div className="user-cell-sub">+91 98765 43210</div>
                    </div>
                  </div>
                </td>
                <td>Interactive Meta survey submitted</td>
                <td>22h remaining</td>
                <td>
                  <span className="status-tag pending">Pending</span>
                </td>
              </tr>

              <tr>
                <td>
                  <div className="user-cell">
                    <div className="user-cell-avatar" style={{ background: '#dcfce7', color: '#166534' }}>
                      NB
                    </div>
                    <div>
                      <div className="user-cell-name">Noah Bennett</div>
                      <div className="user-cell-sub">+44 7700 900077</div>
                    </div>
                  </div>
                </td>
                <td>Demo scheduled via WhatsApp Flow</td>
                <td>Resolved</td>
                <td>
                  <span className="status-tag completed">Completed</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Right: Quick Action & Automation Triggers */}
        <div className="saas-card">
          <div className="saas-card-header">
            <span className="saas-card-title">Quick Automations</span>
            <button onClick={() => setActiveTab('chatbot')} className="btn-view-all">
              View all →
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg-panel)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#ecfdf3', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Sparkles size={16} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>Welcome Bot Auto-Reply</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>If keyword = "hi", "pricing"</div>
                </div>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-full)', background: '#fee2e2', color: '#dc2626' }}>
                Active
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg-panel)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Workflow size={16} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>Feedback Survey Flow</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Interactive 5-star rating</div>
                </div>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-full)', background: '#ffedd5', color: '#ea580c' }}>
                Ready
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg-panel)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Radio size={16} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>Summer Promo Campaign</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Broadcast to 940 contacts</div>
                </div>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-full)', background: '#dcfce7', color: '#166534' }}>
                Draft
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
