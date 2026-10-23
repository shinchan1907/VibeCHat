import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { PhonePreview } from '../components/PhonePreview';
import {
  Workflow,
  Plus,
  Send,
  Trash2,
  ChevronUp,
  ChevronDown,
  Layers,
  Copy,
  Check,
  Type,
  AlignLeft,
  ListFilter,
  CheckSquare,
  Sparkles,
  ArrowRight,
  Eye,
  Sliders,
  Smartphone,
  Download,
  RefreshCw,
  ClipboardList,
} from 'lucide-react';

interface FlowComponent {
  id: string;
  type: 'TextHeading' | 'TextSubheading' | 'TextInput' | 'TextArea' | 'Dropdown' | 'Checkbox' | 'Footer';
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: Array<{ id: string; title: string }>;
}

interface FlowScreen {
  id: string;
  title: string;
  children: FlowComponent[];
}

export const MetaFlows: React.FC = () => {
  const [flows, setFlows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedSimFlow, setSelectedSimFlow] = useState<any>(null);

  // Send Flow modal
  const [showSendModal, setShowSendModal] = useState(false);
  const [flowToSend, setFlowToSend] = useState<any>(null);
  const [targetPhone, setTargetPhone] = useState('');
  const [sending, setSending] = useState(false);

  // Visual Builder State
  const [builderFlowName, setBuilderFlowName] = useState('Customer Consultation & Feedback');
  const [builderCategory, setBuilderCategory] = useState('CUSTOMER_SUPPORT');
  const [activeScreenIndex, setActiveScreenIndex] = useState(0);

  const [screens, setScreens] = useState<FlowScreen[]>([
    {
      id: 'SCREEN_LEAD',
      title: 'Contact Information',
      children: [
        { id: 'c1', type: 'TextHeading', label: 'Let\'s get in touch' },
        { id: 'c2', type: 'TextSubheading', label: 'Please share your details so we can assist you.' },
        { id: 'c3', type: 'TextInput', label: 'Full Name', placeholder: 'Enter your name', required: true },
        { id: 'c4', type: 'TextInput', label: 'Business Email', placeholder: 'name@company.com', required: true },
        {
          id: 'c5',
          type: 'Dropdown',
          label: 'Service of Interest',
          required: true,
          options: [
            { id: 'waba', title: 'WhatsApp Business API' },
            { id: 'flows', title: 'Interactive Meta Flows' },
            { id: 'bots', title: 'Automated Chatbot Workflows' },
          ],
        },
        { id: 'c6', type: 'TextArea', label: 'Project Description', placeholder: 'Tell us about your needs...' },
        { id: 'c7', type: 'Footer', label: 'Submit Consultation Request' },
      ],
    },
  ]);

  const loadFlows = async () => {
    try {
      setLoading(true);
      const res = await api.flows.list();
      if (res.success) setFlows(res.flows);
    } catch (err) {
      console.error('Failed to load flows:', err);
    } finally {
      setLoading(false);
    }
  };

  // Flow Submissions (structured leads captured from nfm_reply webhooks)
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);

  const loadSubmissions = async () => {
    try {
      setSubsLoading(true);
      const res = await api.flows.submissions();
      if (res.success) setSubmissions(res.submissions || []);
    } catch (err) {
      console.error('Failed to load flow submissions:', err);
    } finally {
      setSubsLoading(false);
    }
  };

  const handleExportSubmissions = async () => {
    try {
      const blob = await api.flows.exportSubmissions();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'flow-submissions.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Export failed');
    }
  };

  useEffect(() => {
    loadFlows();
    loadSubmissions();
  }, []);

  const handleCopyEndpoint = () => {
    const endpoint = `${window.location.origin}/api/flows/endpoint`;
    navigator.clipboard.writeText(endpoint);
    setCopiedEndpoint(true);
    setTimeout(() => setCopiedEndpoint(false), 2000);
  };

  // Visual Builder Component Management
  const currentScreen = screens[activeScreenIndex] || screens[0];

  const addComponentToScreen = (type: FlowComponent['type']) => {
    const newComp: FlowComponent = {
      id: `field_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type,
      label:
        type === 'TextHeading'
          ? 'New Section Title'
          : type === 'TextSubheading'
          ? 'Subheading explanation text'
          : type === 'TextInput'
          ? 'Full Name / Field'
          : type === 'TextArea'
          ? 'Additional Comments'
          : type === 'Dropdown'
          ? 'Select Option'
          : type === 'Checkbox'
          ? 'I agree to the Terms of Service'
          : 'Submit Form',
      placeholder: type.includes('Text') ? 'Type here...' : undefined,
      required: false,
      options:
        type === 'Dropdown'
          ? [
              { id: 'opt1', title: 'Option 1' },
              { id: 'opt2', title: 'Option 2' },
            ]
          : undefined,
    };

    const updatedChildren = [...currentScreen.children, newComp];
    const updatedScreens = [...screens];
    updatedScreens[activeScreenIndex] = { ...currentScreen, children: updatedChildren };
    setScreens(updatedScreens);
  };

  const updateComponent = (index: number, updates: Partial<FlowComponent>) => {
    const updatedChildren = [...currentScreen.children];
    updatedChildren[index] = { ...updatedChildren[index], ...updates };
    const updatedScreens = [...screens];
    updatedScreens[activeScreenIndex] = { ...currentScreen, children: updatedChildren };
    setScreens(updatedScreens);
  };

  const removeComponent = (index: number) => {
    const updatedChildren = currentScreen.children.filter((_, i) => i !== index);
    const updatedScreens = [...screens];
    updatedScreens[activeScreenIndex] = { ...currentScreen, children: updatedChildren };
    setScreens(updatedScreens);
  };

  const moveComponent = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= currentScreen.children.length) return;

    const updatedChildren = [...currentScreen.children];
    const item = updatedChildren[index];
    updatedChildren[index] = updatedChildren[targetIdx];
    updatedChildren[targetIdx] = item;

    const updatedScreens = [...screens];
    updatedScreens[activeScreenIndex] = { ...currentScreen, children: updatedChildren };
    setScreens(updatedScreens);
  };

  // Convert Visual Screen to standard Meta Flow JSON spec
  const compileMetaFlowJson = () => {
    return {
      version: '3.1',
      screens: screens.map((s) => ({
        id: s.id,
        title: s.title,
        data: {},
        terminal: false,
        layout: {
          type: 'SingleColumnLayout',
          children: s.children.map((c) => {
            if (c.type === 'TextHeading') {
              return { type: 'TextHeading', text: c.label };
            }
            if (c.type === 'TextSubheading') {
              return { type: 'TextSubheading', text: c.label };
            }
            if (c.type === 'TextInput') {
              return {
                type: 'TextInput',
                name: c.label.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                label: c.label,
                required: c.required ?? false,
              };
            }
            if (c.type === 'TextArea') {
              return {
                type: 'TextArea',
                name: c.label.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                label: c.label,
                required: c.required ?? false,
              };
            }
            if (c.type === 'Dropdown') {
              return {
                type: 'Dropdown',
                name: c.label.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                label: c.label,
                required: c.required ?? true,
                'data-source': c.options || [],
              };
            }
            if (c.type === 'Footer') {
              return {
                type: 'Footer',
                label: c.label,
                'on-click-action': {
                  name: 'complete',
                  payload: { form_data: '${form}' },
                },
              };
            }
            return { type: 'TextInput', label: c.label };
          }),
        },
      })),
    };
  };

  const handleSaveFlow = async () => {
    try {
      const generatedJson = compileMetaFlowJson();
      const res = await api.flows.create({
        name: builderFlowName,
        categories: [builderCategory],
        flow_json: generatedJson,
      });

      if (res.success) {
        setShowBuilder(false);
        loadFlows();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to register flow');
    }
  };

  const handleSendFlow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flowToSend || !targetPhone) return;

    try {
      setSending(true);
      const res = await api.flows.send(flowToSend.id, {
        phone_number: targetPhone,
        header_text: flowToSend.name,
        body_text: `Tap below to complete ${flowToSend.name} inside WhatsApp.`,
        call_to_action: 'Open Form',
      });

      if (res.success) {
        alert('Flow interactive message successfully sent!');
        setShowSendModal(false);
        setTargetPhone('');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to dispatch flow');
    } finally {
      setSending(false);
    }
  };

  const endpointUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/flows/endpoint`;

  return (
    <div className="page-container">
      {/* 1. If Visual Builder is OPEN: Full Visual Drag-and-Drop / Interactive Form Designer */}
      {showBuilder ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Top Bar inside Builder */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button onClick={() => setShowBuilder(false)} className="btn-secondary">
                ← Back to Flows
              </button>
              <div>
                <input
                  type="text"
                  value={builderFlowName}
                  onChange={(e) => setBuilderFlowName(e.target.value)}
                  style={{ fontSize: '18px', fontWeight: 800, padding: '4px 10px', background: '#ffffff', width: '380px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowBuilder(false)} className="btn-secondary">
                Discard
              </button>
              <button onClick={handleSaveFlow} className="btn-pitch">
                <Sparkles size={16} />
                <span>Save & Publish Flow</span>
              </button>
            </div>
          </div>

          {/* 3-Column Responsive Visual Builder */}
          <div className="meta-flow-builder-grid">
            {/* Column 1: Component Palette */}
            <div className="saas-card" style={{ padding: '18px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layers size={15} style={{ color: 'var(--accent-peach)' }} />
                <span>Component Palette</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  { type: 'TextHeading', label: 'Text Heading', icon: Type, desc: 'Large title text' },
                  { type: 'TextSubheading', label: 'Subheading', icon: AlignLeft, desc: 'Supporting caption' },
                  { type: 'TextInput', label: 'Short Text Input', icon: Type, desc: 'Name, email, phone' },
                  { type: 'TextArea', label: 'Multi-line Paragraph', icon: AlignLeft, desc: 'Long feedback/notes' },
                  { type: 'Dropdown', label: 'Dropdown Menu', icon: ListFilter, desc: 'Select from list' },
                  { type: 'Footer', label: 'Submit Button', icon: ArrowRight, desc: 'Complete action' },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => addComponentToScreen(item.type as any)}
                      style={{
                        padding: '10px 12px',
                        background: '#ffffff',
                        border: '1px solid var(--border-medium)',
                        borderRadius: 'var(--radius-sm)',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--accent-peach)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-medium)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'var(--accent-peach-subtle)', color: 'var(--accent-peach-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={14} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          + {item.label}
                        </div>
                        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                          {item.desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Column 2: Visual Canvas & Field Editor */}
            <div className="saas-card" style={{ padding: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Screen: {currentScreen.title}</h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Click any field to edit properties or reorder using the arrows.
                  </p>
                </div>
                <span className="badge-growth positive">{currentScreen.children.length} Elements</span>
              </div>

              {/* Canvas Items List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {currentScreen.children.map((child, idx) => (
                  <div
                    key={child.id}
                    style={{
                      background: '#ffffff',
                      border: '1.5px solid var(--border-light)',
                      borderRadius: 'var(--radius-md)',
                      padding: '14px 18px',
                      boxShadow: 'var(--shadow-sm)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-peach-hover)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {child.type}
                      </span>

                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          onClick={() => moveComponent(idx, 'up')}
                          disabled={idx === 0}
                          className="btn-icon"
                          style={{ width: '24px', height: '24px' }}
                        >
                          <ChevronUp size={13} />
                        </button>
                        <button
                          onClick={() => moveComponent(idx, 'down')}
                          disabled={idx === currentScreen.children.length - 1}
                          className="btn-icon"
                          style={{ width: '24px', height: '24px' }}
                        >
                          <ChevronDown size={13} />
                        </button>
                        <button
                          onClick={() => removeComponent(idx)}
                          className="btn-icon"
                          style={{ width: '24px', height: '24px', color: 'var(--accent-coral)' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Field label input */}
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Field Title / Question:
                      </label>
                      <input
                        type="text"
                        value={child.label}
                        onChange={(e) => updateComponent(idx, { label: e.target.value })}
                        style={{ width: '100%', padding: '8px 12px' }}
                      />
                    </div>

                    {/* Dropdown Options Manager */}
                    {child.type === 'Dropdown' && (
                      <div style={{ background: 'var(--bg-panel)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                        <div style={{ fontSize: '11.5px', fontWeight: 700, marginBottom: '6px' }}>Options:</div>
                        {(child.options || []).map((opt, optIdx) => (
                          <div key={optIdx} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                            <input
                              type="text"
                              value={opt.title}
                              onChange={(e) => {
                                const newOpts = [...(child.options || [])];
                                newOpts[optIdx] = { ...newOpts[optIdx], title: e.target.value };
                                updateComponent(idx, { options: newOpts });
                              }}
                              style={{ flex: 1, padding: '6px 10px', fontSize: '12px' }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const newOpts = (child.options || []).filter((_, i) => i !== optIdx);
                                updateComponent(idx, { options: newOpts });
                              }}
                              className="btn-icon"
                              style={{ width: '28px', height: '28px', color: 'var(--accent-coral)' }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            const newOpts = [...(child.options || []), { id: `opt_${Date.now()}`, title: `Option ${(child.options || []).length + 1}` }];
                            updateComponent(idx, { options: newOpts });
                          }}
                          className="btn-secondary"
                          style={{ padding: '3px 8px', fontSize: '11px', marginTop: '4px' }}
                        >
                          + Add Option
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Column 3: Live Interactive Smartphone Simulator */}
            <div className="meta-flow-preview-column" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Smartphone size={16} />
                <span>Live Phone Mockup</span>
              </div>
              <PhonePreview
                flowScreen={{
                  title: currentScreen.title,
                  children: currentScreen.children.map((c) => ({
                    type: c.type,
                    label: c.label,
                    text: c.label,
                  })),
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        /* 2. Flows Grid View (When NOT in builder) */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Endpoint Banner */}
          <div
            className="saas-card"
            style={{
              background: 'linear-gradient(135deg, #fef4ea 0%, #ffffff 100%)',
              border: '1px solid #fbd9b3',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-peach-hover)', fontWeight: 800, fontSize: '15px' }}>
                <Workflow size={18} />
                <span>Meta WhatsApp Flows Webhook Endpoint</span>
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Paste this endpoint URL in your Meta App Dashboard under <strong>WhatsApp &gt; Flows</strong>.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#ffffff', padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-medium)' }}>
              <code style={{ fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {endpointUrl}
              </code>
              <button onClick={handleCopyEndpoint} className="btn-icon" style={{ width: '26px', height: '26px' }}>
                {copiedEndpoint ? <Check size={14} style={{ color: '#16a34a' }} /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          {/* Action Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                Meta WhatsApp Interactive Forms
              </h2>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                Visual drag-and-drop form builder for in-chat WhatsApp customer surveys and lead forms.
              </p>
            </div>

            <button onClick={() => setShowBuilder(true)} className="btn-pitch">
              <Plus size={16} />
              <span>+ Visual Flow Builder</span>
            </button>
          </div>

          {/* Flows Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
            {flows.map((flow) => {
              const screensList = flow.flow_json?.screens || [];
              const firstScreen = screensList[0] || {};

              return (
                <div key={flow.id} className="saas-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <div>
                        <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                          {flow.name}
                        </h3>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {screensList.length} Interactive Screen(s) • Spec v3.1
                        </div>
                      </div>

                      <span className="status-tag completed">
                        {flow.status}
                      </span>
                    </div>

                    <div style={{ background: 'var(--bg-panel)', padding: '12px', borderRadius: 'var(--radius-sm)', fontSize: '12px', marginTop: '10px' }}>
                      <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                        Initial Screen: {firstScreen.title || 'Screen 1'}
                      </div>
                      <div style={{ color: 'var(--text-secondary)' }}>
                        Fields: {(firstScreen.layout?.children || []).map((c: any) => c.type).join(', ') || 'Form'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-light)' }}>
                    <button
                      onClick={() => setSelectedSimFlow(flow)}
                      className="btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      <Eye size={13} />
                      <span>Phone Simulator</span>
                    </button>

                    <button
                      onClick={() => {
                        setFlowToSend(flow);
                        setShowSendModal(true);
                      }}
                      className="btn-pitch"
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      <Send size={13} />
                      <span>Send in Chat</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Flow Submissions — structured leads + Excel export */}
      <div className="saas-card" style={{ padding: '20px', marginTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClipboardList size={17} style={{ color: 'var(--accent-peach)' }} />
            <h3 style={{ fontSize: '15px', fontWeight: 800 }}>Flow Submissions</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>({submissions.length})</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={loadSubmissions} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} disabled={subsLoading}>
              <RefreshCw size={13} />
              <span>Refresh</span>
            </button>
            <button onClick={handleExportSubmissions} className="btn-pitch" style={{ padding: '6px 12px', fontSize: '12px' }} disabled={submissions.length === 0}>
              <Download size={13} />
              <span>Export Excel (CSV)</span>
            </button>
          </div>
        </div>

        {submissions.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '12px 0' }}>
            No submissions yet. When someone fills and submits a flow, their details will appear here automatically.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  {['Submitted At', 'Phone Number', 'Flow', ...Array.from(new Set(submissions.flatMap((s) => Object.keys(s.fields || {}))))].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {h.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => {
                  const cols = Array.from(new Set(submissions.flatMap((x) => Object.keys(x.fields || {}))));
                  return (
                    <tr key={s.id}>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>
                        {new Date(s.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>+{s.phone_number}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>{s.flow_name}</td>
                      {cols.map((k) => (
                        <td key={k} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-light)' }}>{String((s.fields || {})[k] ?? '')}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Simulator Modal */}
      {selectedSimFlow && (
        <div className="saas-modal-overlay" onClick={() => setSelectedSimFlow(null)}>
          <div className="saas-modal-card animate-pop" style={{ maxWidth: '420px', padding: '24px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800 }}>{selectedSimFlow.name}</h3>
              <button onClick={() => setSelectedSimFlow(null)} className="btn-icon">✕</button>
            </div>
            <PhonePreview
              flowScreen={{
                title: selectedSimFlow.flow_json?.screens?.[0]?.title || selectedSimFlow.name,
                children: selectedSimFlow.flow_json?.screens?.[0]?.layout?.children || [],
              }}
            />
          </div>
        </div>
      )}

      {/* Send in Chat Modal */}
      {showSendModal && flowToSend && (
        <div className="saas-modal-overlay" onClick={() => setShowSendModal(false)}>
          <div className="saas-modal-card animate-pop" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="saas-modal-header">
              <h3 style={{ fontSize: '17px', fontWeight: 800 }}>Send Flow to WhatsApp Contact</h3>
              <button onClick={() => setShowSendModal(false)} className="btn-icon">✕</button>
            </div>
            <form onSubmit={handleSendFlow}>
              <div className="saas-modal-body">
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                    Recipient Phone Number (with Country Code)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. +1 (555) 019-2834 or 919876543210"
                    value={targetPhone}
                    onChange={(e) => setTargetPhone(e.target.value)}
                    required
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Sends an interactive WhatsApp Flow message. The recipient can tap "Open Form" directly inside WhatsApp to fill it out.
                </div>
              </div>
              <div className="saas-modal-footer">
                <button type="button" onClick={() => setShowSendModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={sending} className="btn-pitch">
                  {sending ? 'Sending...' : 'Send Flow'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
