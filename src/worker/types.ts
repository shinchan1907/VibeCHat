export interface Env {
  DB: D1Database;
  MEDIA_BUCKET?: R2Bucket;
  ADMIN_EMAIL?: string;
  ENVIRONMENT?: string;
  ASSETS?: Fetcher;
  EMAIL?: any; // Cloudflare Email Routing send_email binding
}

export interface WabaSettings {
  id: string;
  phone_number_id?: string;
  waba_id?: string;
  access_token?: string;
  app_secret?: string;
  verify_token?: string;
  display_phone_number?: string;
  business_name?: string;
  resend_api_key?: string;
  from_email?: string;
  updated_at?: string;
}

export interface Contact {
  id: string;
  phone_number: string;
  name?: string;
  email?: string;
  tags: string[]; // parsed from JSON
  custom_attributes: Record<string, any>;
  opt_in_status: 'opted_in' | 'opted_out';
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  contact_id: string;
  contact_phone: string;
  contact_name?: string;
  last_message_text?: string;
  last_message_at: string;
  last_customer_message_at?: string;
  unread_count: number;
  is_pinned: number;
  status: 'open' | 'resolved' | 'pending';
  created_at: string;
  updated_at: string;
  is_window_open?: boolean;
  window_expires_at?: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  wamid?: string;
  direction: 'inbound' | 'outbound';
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'template' | 'interactive' | 'flow';
  content?: string;
  media_url?: string;
  media_mime_type?: string;
  media_caption?: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  error_code?: string;
  error_message?: string;
  raw_payload?: string;
  created_at: string;
}

export interface Template {
  id: string;
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED';
  header_type?: 'NONE' | 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO';
  header_content?: string;
  body_text: string;
  footer_text?: string;
  buttons_json: any[];
  meta_raw?: string;
  synced_at: string;
  created_at: string;
}

export interface Broadcast {
  id: string;
  name: string;
  template_id?: string;
  template_name: string;
  template_language: string;
  variable_mappings: any[];
  status: 'draft' | 'scheduled' | 'processing' | 'completed' | 'failed' | 'paused';
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  target_tags: string[];
  scheduled_at?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface Flow {
  id: string;
  name: string;
  categories: string[];
  status: 'DRAFT' | 'PUBLISHED' | 'DEPRECATED';
  flow_json: any;
  endpoint_uri?: string;
  preview_data?: any;
  synced_at: string;
  created_at: string;
}
