import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import {
  Bot,
  Plus,
  Play,
  Save,
  Trash2,
  GitBranch,
  MessageSquare,
  Sparkles,
  Zap,
  Tag,
  ArrowRight,
  Check,
  Smartphone,
  Send,
  HelpCircle,
} from 'lucide-react';

interface BotNode {
  id: string;
  type: 'trigger' | 'condition' | 'message' | 'buttons' | 'action';
  title: string;
  config: {
    keywords?: string[];
    field?: string;
    operator?: string;
    value?: string;
    text?: string;
    buttons?: string[];
    action_type?: string;
    tag_name?: string;
  };
}

export const ChatbotBuilder: React.FC = () => {
  const [bots, setBots] = useState<any[]>([]);
  const [activeBot, setActiveBot] = useState<any>(null);
  const [nodes, setNodes] = useState<BotNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Live Simulator State
  const [testInput, setTestInput] = useState('Hi, what is your pricing?');
  const [simLog, setSimLog] = useState<any[]>([]);
  const [simReply, setSimReply] = useState<{ text?: string; buttons?: string[] } | null>(null);

  const loadBots = async () => {
    try {
      setLoading(true);
      const res = await api.bots.list();
      if (res.success && res.bots?.length > 0) {
        setBots(res.bots);
        setActiveBot(res.bots[0]);
        setNodes(res.bots[0].nodes || []);
      }
    } catch (err) {
      console.error('Failed to load bots:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBots();
  }, []);

  const handleSelectBot = (bot: any) => {
    setActiveBot(bot);
    setNodes(bot.nodes || []);
    setSimReply(null);
    setSimLog([]);
  };

  const addNode = (type: BotNode['type']) => {
    const newNode: BotNode = {
      id: `node_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type,
      title:
        type === 'condition'
          ? 'If / Else: Condition'
          : type === 'message'
          ? 'Send Message'
          : type === 'buttons'
          ? 'Interactive Quick Replies'
          : 'Apply Tag Action',
      config:
        type === 'condition'
          ? { field: 'message_text', operator: 'contains', value: 'pricing' }
          : type === 'message'
          ? { text: 'Hello! Thanks for contacting us.' }
          : type === 'buttons'
          ? { text: 'Choose an option below:', buttons: ['Sales', 'Support', 'Pricing'] }
          : { action_type: 'add_tag', tag_name: 'Hot Lead' },
    };

    setNodes([...nodes, newNode]);
  };

  const updateNodeConfig = (nodeId: string, updates: Partial<BotNode['config']>) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, config: { ...n.config, ...updates } } : n))
    );
  };

  const updateNodeTitle = (nodeId: string, title: string) => {
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, title } : n)));
  };

  const removeNode = (nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
  };

  const handleSaveBot = async () => {
    if (!activeBot) return;
    try {
      setSaving(true);
      await api.bots.save({
        id: activeBot.id,
        name: activeBot.name,
        description: activeBot.description,
        trigger_type: activeBot.trigger_type || 'keyword',
        trigger_keywords: activeBot.trigger_keywords || [],
        nodes,
      });
      alert('Chatbot workflow successfully saved and live on Cloudflare Worker!');
      loadBots();
    } catch (err: any) {
      alert(err.message || 'Failed to save bot');
    } finally {
      setSaving(false);
    }
  };

  const handleSimulate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!testInput.trim() || !activeBot) return;

    try {
      const res = await api.bots.simulate({
        bot_id: activeBot.id,
        message: testInput,
      });

      if (res.success) {
        setSimLog(res.executionPath || []);
        setSimReply(res.reply);
      }
    } catch (err) {
      console.error('Simulation error:', err);
    }
  };

  return (
    <div className="page-container">
      {/* Top Action & Selector Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <select
            value={activeBot?.id || ''}
            onChange={(e) => {
              const b = bots.find((item) => item.id === e.target.value);
              if (b) handleSelectBot(b);
            }}
            style={{ fontWeight: 700, fontSize: '15px', padding: '8px 16px', background: '#ffffff', minWidth: '280px' }}
          >
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
                🤖 {b.name}
              </option>
            ))}
          </select>

          <span className="badge-growth positive">
            {activeBot?.is_active ? '● Active on Webhook' : '○ Disabled'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => addNode('condition')} className="btn-secondary">
            <GitBranch size={15} style={{ color: '#2563eb' }} />
            <span>+ If / Else Node</span>
          </button>
          <button onClick={() => addNode('message')} className="btn-secondary">
            <MessageSquare size={15} style={{ color: '#16a34a' }} />
            <span>+ Message Node</span>
          </button>
          <button onClick={() => addNode('buttons')} className="btn-secondary">
            <Sparkles size={15} style={{ color: 'var(--accent-peach)' }} />
            <span>+ Quick Replies Node</span>
          </button>
          <button onClick={handleSaveBot} disabled={saving} className="btn-pitch">
            <Save size={15} />
            <span>{saving ? 'Saving...' : 'Save Workflow'}</span>
          </button>
        </div>
      </div>

      {/* Main Visual Flowchart & Simulator Layout */}
      <div className="chatbot-builder-grid">
        {/* Flowchart Visual Canvas */}
        <div className="flow-builder-canvas" style={{ borderRadius: 'var(--radius-lg)', minHeight: '560px', flexWrap: 'wrap' }}>
          {nodes.map((node, index) => {
            const isTrigger = node.type === 'trigger';
            const isCondition = node.type === 'condition';
            const isMsg = node.type === 'message';
            const isBtn = node.type === 'buttons';

            return (
              <div key={node.id} className="flow-node-card animate-pop">
                {/* Header */}
                <div className={`flow-node-header ${node.type}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isTrigger && <Zap size={14} />}
                    {isCondition && <GitBranch size={14} />}
                    {isMsg && <MessageSquare size={14} />}
                    {isBtn && <Sparkles size={14} />}
                    <span>{node.title}</span>
                  </div>

                  {!isTrigger && (
                    <button
                      onClick={() => removeNode(node.id)}
                      className="btn-icon"
                      style={{ width: '22px', height: '22px', color: 'var(--text-muted)' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>

                {/* Node Configuration Body */}
                <div className="flow-node-body">
                  {/* Trigger Node Config */}
                  {isTrigger && (
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Match Any Incoming Keyword:
                      </div>
                      <input
                        type="text"
                        value={(node.config.keywords || []).join(', ')}
                        onChange={(e) =>
                          updateNodeConfig(node.id, {
                            keywords: e.target.value.split(',').map((k) => k.trim()),
                          })
                        }
                        placeholder="e.g. hi, pricing, hello"
                        style={{ width: '100%', fontSize: '12px' }}
                      />
                    </div>
                  )}

                  {/* If-Else Condition Node Config */}
                  {isCondition && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ background: '#f8fafc', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11.5px' }}>
                        <strong>IF</strong> customer message:
                        <select
                          value={node.config.operator || 'contains'}
                          onChange={(e) => updateNodeConfig(node.id, { operator: e.target.value })}
                          style={{ width: '100%', marginTop: '4px', fontSize: '11px', padding: '4px' }}
                        >
                          <option value="contains">Contains keyword</option>
                          <option value="equals">Exact match</option>
                          <option value="starts_with">Starts with</option>
                        </select>
                        <input
                          type="text"
                          value={node.config.value || ''}
                          onChange={(e) => updateNodeConfig(node.id, { value: e.target.value })}
                          placeholder="e.g. pricing, demo, quotation"
                          style={{ width: '100%', marginTop: '6px', fontSize: '11px', padding: '6px' }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700 }}>
                        <span style={{ color: '#16a34a' }}>✓ Branch TRUE</span>
                        <span style={{ color: '#ea580c' }}>✕ Branch FALSE</span>
                      </div>
                    </div>
                  )}

                  {/* Message Node Config */}
                  {isMsg && (
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Response Text:</label>
                      <textarea
                        rows={3}
                        value={node.config.text || ''}
                        onChange={(e) => updateNodeConfig(node.id, { text: e.target.value })}
                        style={{ width: '100%', fontSize: '12px', marginTop: '4px' }}
                      />
                    </div>
                  )}

                  {/* Buttons Node Config */}
                  {isBtn && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Prompt Text:</label>
                      <input
                        type="text"
                        value={node.config.text || ''}
                        onChange={(e) => updateNodeConfig(node.id, { text: e.target.value })}
                        style={{ width: '100%', fontSize: '12px' }}
                      />
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Buttons (Comma separated):
                      </label>
                      <input
                        type="text"
                        value={(node.config.buttons || []).join(', ')}
                        onChange={(e) =>
                          updateNodeConfig(node.id, {
                            buttons: e.target.value.split(',').map((b) => b.trim()),
                          })
                        }
                        style={{ width: '100%', fontSize: '12px' }}
                      />
                    </div>
                  )}
                </div>

                {/* Footer Connector */}
                <div className="flow-node-footer">
                  <span style={{ color: 'var(--text-muted)' }}>Step {index + 1}</span>
                  <span style={{ color: 'var(--accent-peach)', fontWeight: 700 }}>Next Node →</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Live Simulator & Interactive Chat Tester Drawer */}
        <div className="saas-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <Smartphone size={18} style={{ color: 'var(--accent-peach)' }} />
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}>Chatbot Live Simulator</h3>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Test how the bot evaluates If/Else branches in real time.
            </p>

            {/* Test Input Form */}
            <form onSubmit={handleSimulate} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                type="text"
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder="Type customer message..."
                style={{ flex: 1, fontSize: '12.5px' }}
              />
              <button type="submit" className="btn-pitch" style={{ padding: '8px 12px' }}>
                <Send size={14} />
              </button>
            </form>

            {/* Execution Trace */}
            {simLog.length > 0 && (
              <div style={{ background: 'var(--bg-panel)', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '11.5px', border: '1px solid var(--border-light)' }}>
                <div style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Execution Decision Path:
                </div>
                {simLog.map((step, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <Check size={12} style={{ color: '#16a34a' }} />
                    <span style={{ fontWeight: 600 }}>{step.title}</span>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: step.status.includes('TRUE') ? '#dcfce7' : '#f1f5f9',
                        color: step.status.includes('TRUE') ? '#166534' : '#475569',
                      }}
                    >
                      {step.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Mockup WhatsApp Phone Bubble Output */}
            {simReply && (
              <div style={{ background: '#efeae2', borderRadius: '12px', padding: '16px', border: '1px solid #dcd7ce' }}>
                <div style={{ fontSize: '11px', color: '#667781', marginBottom: '6px', fontWeight: 600 }}>
                  Bot WhatsApp Response:
                </div>
                <div style={{ background: '#ffffff', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', color: '#111b21', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                  {simReply.text}
                </div>

                {simReply.buttons && simReply.buttons.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                    {simReply.buttons.map((b, i) => (
                      <div
                        key={i}
                        style={{
                          background: '#ffffff',
                          color: '#00a884',
                          padding: '7px',
                          borderRadius: '6px',
                          textAlign: 'center',
                          fontSize: '12px',
                          fontWeight: 700,
                          border: '1px solid #e0dfdb',
                        }}
                      >
                        {b}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '16px', borderTop: '1px solid var(--border-light)', paddingTop: '10px' }}>
            Powered by Cloudflare Workers Serverless Bot Engine
          </div>
        </div>
      </div>
    </div>
  );
};
