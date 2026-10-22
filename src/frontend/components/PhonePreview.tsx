import React from 'react';
import { ExternalLink, Phone, MessageSquare, ChevronRight } from 'lucide-react';

interface PhonePreviewProps {
  headerType?: 'NONE' | 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO';
  headerContent?: string;
  bodyText?: string;
  footerText?: string;
  buttons?: Array<{
    type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'FLOW';
    text: string;
    url?: string;
    phone_number?: string;
  }>;
  variableValues?: Record<string, string>;
  flowScreen?: {
    title?: string;
    children?: any[];
  };
}

export const PhonePreview: React.FC<PhonePreviewProps> = ({
  headerType = 'NONE',
  headerContent,
  bodyText = '',
  footerText,
  buttons = [],
  variableValues = {},
  flowScreen,
}) => {
  // Replace {{1}}, {{2}} or {{name}} in body with dynamic values
  const interpolateText = (text: string) => {
    let result = text;
    for (const [key, val] of Object.entries(variableValues)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val || `{{${key}}}`);
    }
    return result;
  };

  const renderedBody = interpolateText(bodyText);

  return (
    <div className="phone-mockup-frame">
      <div className="phone-mockup-speaker" />

      {/* WhatsApp Status Bar & Header */}
      <div className="phone-mockup-header">
        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#00a884', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111b21', fontWeight: 'bold', fontSize: '13px' }}>
          W
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#e9edef', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            ByteNex Business
          </div>
          <div style={{ fontSize: '10px', color: '#00a884' }}>Official Business Account</div>
        </div>
      </div>

      {/* WhatsApp Message Body */}
      <div className="phone-mockup-body">
        {/* If previewing a Meta Flow */}
        {flowScreen ? (
          <div style={{ background: '#1f2c34', borderRadius: '12px', padding: '16px', color: '#e9edef', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, borderBottom: '1px solid #2a3942', paddingBottom: '8px' }}>
              {flowScreen.title || 'WhatsApp Flow'}
            </div>
            {(flowScreen.children || []).map((child, idx) => {
              if (child.type === 'TextHeading') {
                return <div key={idx} style={{ fontSize: '14px', fontWeight: 600 }}>{child.text}</div>;
              }
              if (child.type === 'TextSubheading') {
                return <div key={idx} style={{ fontSize: '12px', color: '#8696a0' }}>{child.text}</div>;
              }
              if (child.type === 'TextInput' || child.type === 'TextArea') {
                return (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', color: '#8696a0' }}>{child.label}</label>
                    <div style={{ background: '#111b21', border: '1px solid #2a3942', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', color: '#667781' }}>
                      {child.label}...
                    </div>
                  </div>
                );
              }
              if (child.type === 'Dropdown') {
                return (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', color: '#8696a0' }}>{child.label}</label>
                    <div style={{ background: '#111b21', border: '1px solid #2a3942', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#e9edef' }}>
                      <span>Select option</span>
                      <ChevronRight size={14} style={{ transform: 'rotate(90deg)' }} />
                    </div>
                  </div>
                );
              }
              if (child.type === 'Footer') {
                return (
                  <button key={idx} style={{ width: '100%', background: '#00a884', color: '#111b21', padding: '10px', borderRadius: '8px', fontWeight: 700, fontSize: '13px', marginTop: '8px' }}>
                    {child.label || 'Submit'}
                  </button>
                );
              }
              return null;
            })}
          </div>
        ) : (
          /* Template Bubble */
          <div style={{ background: '#202c33', borderRadius: '8px', padding: '10px 12px', color: '#e9edef', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
            {/* Header Content */}
            {headerType === 'TEXT' && headerContent && (
              <div style={{ fontWeight: 700, fontSize: '14px', color: '#e9edef' }}>
                {headerContent}
              </div>
            )}
            {headerType === 'IMAGE' && (
              <div style={{ height: '120px', background: '#111b21', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8696a0', fontSize: '12px', border: '1px dashed #2a3942' }}>
                [Media Header]
              </div>
            )}

            {/* Body */}
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.45' }}>
              {renderedBody || 'Your template message body will appear here...'}
            </div>

            {/* Footer */}
            {footerText && (
              <div style={{ fontSize: '11px', color: '#8696a0', marginTop: '2px' }}>
                {footerText}
              </div>
            )}

            {/* Timestamp */}
            <div style={{ fontSize: '10px', color: '#8696a0', alignSelf: 'flex-end', marginTop: '2px' }}>
              10:30 AM
            </div>

            {/* Interactive Buttons */}
            {buttons && buttons.length > 0 && (
              <div style={{ borderTop: '1px solid #2a3942', marginTop: '6px', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {buttons.map((btn, i) => (
                  <div
                    key={i}
                    style={{
                      background: '#111b21',
                      color: '#00a884',
                      padding: '8px',
                      borderRadius: '6px',
                      textAlign: 'center',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    {btn.type === 'URL' && <ExternalLink size={13} />}
                    {btn.type === 'PHONE_NUMBER' && <Phone size={13} />}
                    {btn.type === 'QUICK_REPLY' && <MessageSquare size={13} />}
                    <span>{btn.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
