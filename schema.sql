-- ============================================================================
-- WhatsApp Business API (WABA) Platform Database Schema for Cloudflare D1
-- Single-Business Architecture (contact@bytenex.io)
-- ============================================================================

-- Admin User Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'admin',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Email OTP verification codes
CREATE TABLE IF NOT EXISTS otp_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  used INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  ip TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Admin Sessions (Token auth)
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- WhatsApp Cloud API Configuration & Business Settings
CREATE TABLE IF NOT EXISTS waba_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  phone_number_id TEXT,
  waba_id TEXT,
  access_token TEXT,
  app_secret TEXT,
  verify_token TEXT DEFAULT 'bytenex_waba_verify_2026',
  display_phone_number TEXT,
  business_name TEXT DEFAULT 'ByteNex WABA',
  resend_api_key TEXT,
  zeptomail_api_key TEXT,
  from_email TEXT DEFAULT 'contact@bytenex.io',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Contacts
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  phone_number TEXT UNIQUE NOT NULL,
  name TEXT,
  email TEXT,
  tags TEXT DEFAULT '[]', -- JSON array of tags, e.g. ["VIP", "Customer"]
  custom_attributes TEXT DEFAULT '{}', -- JSON object for dynamic attributes
  opt_in_status TEXT DEFAULT 'opted_in', -- 'opted_in', 'opted_out'
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Active Conversations (Inbox)
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  contact_phone TEXT NOT NULL,
  contact_name TEXT,
  last_message_text TEXT,
  last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_customer_message_at DATETIME, -- Crucial for tracking the Meta 24h Customer Service Window
  unread_count INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open', -- 'open', 'resolved', 'pending'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Chat Messages (Inbound and Outbound)
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  wamid TEXT UNIQUE, -- Meta WhatsApp Message ID (e.g. wamid.HBg...)
  direction TEXT NOT NULL, -- 'inbound' or 'outbound'
  type TEXT NOT NULL, -- 'text', 'image', 'document', 'audio', 'video', 'template', 'interactive', 'flow'
  content TEXT, -- Plain text message or structured message summary
  media_url TEXT, -- Cloudflare R2 or direct media proxy URL
  media_mime_type TEXT,
  media_caption TEXT,
  status TEXT DEFAULT 'sent', -- 'pending', 'sent', 'delivered', 'read', 'failed'
  error_code TEXT,
  error_message TEXT,
  raw_payload TEXT, -- Raw JSON from webhook or send response
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- WhatsApp Templates (Synced or Created)
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY, -- Meta template ID or local ID
  name TEXT NOT NULL,
  language TEXT DEFAULT 'en_US',
  category TEXT NOT NULL, -- 'MARKETING', 'UTILITY', 'AUTHENTICATION'
  status TEXT NOT NULL, -- 'APPROVED', 'PENDING', 'REJECTED', 'PAUSED'
  header_type TEXT DEFAULT 'NONE', -- 'NONE', 'TEXT', 'IMAGE', 'DOCUMENT', 'VIDEO'
  header_content TEXT,
  body_text TEXT NOT NULL,
  footer_text TEXT,
  buttons_json TEXT DEFAULT '[]', -- JSON array of buttons (QUICK_REPLY, URL, PHONE_NUMBER)
  meta_raw TEXT,
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Broadcast Campaigns
CREATE TABLE IF NOT EXISTS broadcasts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template_id TEXT REFERENCES templates(id),
  template_name TEXT NOT NULL,
  template_language TEXT DEFAULT 'en_US',
  variable_mappings TEXT DEFAULT '[]', -- JSON array of template parameter values
  status TEXT DEFAULT 'draft', -- 'draft', 'scheduled', 'processing', 'completed', 'failed', 'paused'
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  read_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  target_tags TEXT DEFAULT '[]',
  scheduled_at DATETIME,
  started_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Broadcast Recipients Tracking
CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id TEXT PRIMARY KEY,
  broadcast_id TEXT NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  phone_number TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'read', 'failed'
  wamid TEXT,
  error_message TEXT,
  sent_at DATETIME,
  delivered_at DATETIME,
  read_at DATETIME
);

-- Meta Flows (WhatsApp Interactive Forms & Flows)
CREATE TABLE IF NOT EXISTS flows (
  id TEXT PRIMARY KEY, -- Meta Flow ID
  name TEXT NOT NULL,
  categories TEXT DEFAULT '[]', -- JSON array of categories
  status TEXT DEFAULT 'DRAFT', -- 'DRAFT', 'PUBLISHED', 'DEPRECATED'
  flow_json TEXT NOT NULL, -- Flow JSON screens definition
  endpoint_uri TEXT,
  preview_data TEXT DEFAULT '{}',
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Chatbot Workflows & Automation (If-Else, Keyword Triggers, Interactive Decision Trees)
CREATE TABLE IF NOT EXISTS chatbot_flows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'keyword', -- 'keyword', 'first_message', 'all_inbound'
  trigger_keywords TEXT DEFAULT '[]', -- JSON array of trigger words
  nodes_json TEXT NOT NULL, -- Visual graph nodes & connections
  is_active INTEGER DEFAULT 1,
  execution_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Activity & Webhook Audit Logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL, -- 'webhook_event', 'message_sent', 'broadcast_sent', 'template_synced', 'auth'
  description TEXT NOT NULL,
  details TEXT, -- JSON details payload
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for lightning fast queries on Cloudflare D1
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_wamid ON messages(wamid);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_bcast ON broadcast_recipients(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_status ON broadcast_recipients(status);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);

-- Seed Initial Default Admin and Settings
INSERT OR IGNORE INTO users (id, email, name, role) 
VALUES ('admin-1', 'contact@bytenex.io', 'ByteNex Admin', 'admin');

INSERT OR IGNORE INTO waba_settings (
  id, 
  business_name, 
  display_phone_number, 
  verify_token, 
  from_email
) VALUES (
  'default', 
  'ByteNex Business', 
  '+1 (555) 019-2834', 
  'bytenex_waba_verify_2026', 
  'contact@bytenex.io'
);
