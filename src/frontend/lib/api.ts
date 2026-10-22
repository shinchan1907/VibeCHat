const API_BASE = '/api';

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('waba_token');
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    if (res.status === 401 && !endpoint.startsWith('/auth')) {
      localStorage.removeItem('waba_token');
      window.dispatchEvent(new Event('auth:logout'));
    }
    const message = (data && typeof data === 'object' && data.error) || res.statusText || 'Request failed';
    throw new ApiError(message, res.status, data);
  }

  return data as T;
}

export const api = {
  auth: {
    sendOtp: (email: string) =>
      request<{ success: boolean; message: string; previewCode?: string }>('/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    verifyOtp: (email: string, code: string) =>
      request<{ success: boolean; token: string; user: any }>('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email, code }),
      }),
    getMe: () => request<{ success: boolean; user: any }>('/auth/me'),
    logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
  },

  chats: {
    list: (params?: { q?: string; status?: string }) => {
      const q = new URLSearchParams();
      if (params?.q) q.set('q', params.q);
      if (params?.status) q.set('status', params.status);
      return request<{ success: boolean; conversations: any[] }>(`/chats?${q.toString()}`);
    },
    getMessages: (conversationId: string) =>
      request<{ success: boolean; conversation: any; messages: any[] }>(`/chats/${conversationId}/messages`),
    sendMessage: (conversationId: string, payload: any) =>
      request<{ success: boolean; message: any }>(`/chats/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    markAsRead: (conversationId: string) =>
      request<{ success: boolean }>(`/chats/${conversationId}/read`, { method: 'POST' }),
    update: (conversationId: string, payload: { status?: string; is_pinned?: boolean }) =>
      request<{ success: boolean }>(`/chats/${conversationId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    start: (payload: { phone_number: string; name?: string; initial_message?: string; template?: any }) =>
      request<{ success: boolean; conversation_id: string }>('/chats/start', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },

  templates: {
    list: (params?: { q?: string; status?: string; category?: string }) => {
      const q = new URLSearchParams();
      if (params?.q) q.set('q', params.q);
      if (params?.status) q.set('status', params.status);
      if (params?.category) q.set('category', params.category);
      return request<{ success: boolean; templates: any[] }>(`/templates?${q.toString()}`);
    },
    sync: () => request<{ success: boolean; count: number }>('/templates/sync', { method: 'POST' }),
    create: (payload: any) =>
      request<{ success: boolean; template: any }>('/templates', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    delete: (id: string) => request<{ success: boolean }>(`/templates/${id}`, { method: 'DELETE' }),
  },

  broadcasts: {
    list: () => request<{ success: boolean; broadcasts: any[] }>('/broadcasts'),
    get: (id: string) => request<{ success: boolean; broadcast: any; recipients: any[] }>(`/broadcasts/${id}`),
    create: (payload: any) =>
      request<{ success: boolean; broadcast_id: string; total_recipients: number; sent_count: number; failed_count: number }>(
        '/broadcasts',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      ),
  },

  flows: {
    list: () => request<{ success: boolean; flows: any[] }>('/flows'),
    get: (id: string) => request<{ success: boolean; flow: any }>(`/flows/${id}`),
    create: (payload: any) =>
      request<{ success: boolean; flow: any }>('/flows', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    update: (id: string, payload: any) =>
      request<{ success: boolean }>(`/flows/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    send: (id: string, payload: { phone_number: string; header_text?: string; body_text?: string; call_to_action?: string }) =>
      request<{ success: boolean; result: any }>(`/flows/${id}/send`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },

  contacts: {
    list: (params?: { q?: string; tag?: string; opt_in?: string }) => {
      const q = new URLSearchParams();
      if (params?.q) q.set('q', params.q);
      if (params?.tag) q.set('tag', params.tag);
      if (params?.opt_in) q.set('opt_in', params.opt_in);
      return request<{ success: boolean; contacts: any[] }>(`/contacts?${q.toString()}`);
    },
    getTags: () => request<{ success: boolean; tags: string[] }>('/contacts/tags'),
    save: (payload: any) => request<{ success: boolean; id: string }>('/contacts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
    import: (payload: { contacts: any[]; default_tags?: string[] }) =>
      request<{ success: boolean; count: number }>('/contacts/import', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    delete: (id: string) => request<{ success: boolean }>(`/contacts/${id}`, { method: 'DELETE' }),
  },

  settings: {
    get: () => request<{ success: boolean; settings: any }>('/settings'),
    save: (payload: any) =>
      request<{ success: boolean; message: string }>('/settings', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    test: () => request<{ success: boolean; data?: any; error?: string }>('/settings/test', { method: 'POST' }),
    getLogs: () => request<{ success: boolean; logs: any[] }>('/settings/logs'),
    clearLogs: () => request<{ success: boolean }>('/settings/logs', { method: 'DELETE' }),
  },

  media: {
    upload: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return request<{ success: boolean; url: string; filename: string; contentType: string; size: number }>(
        '/media/upload',
        {
          method: 'POST',
          body: formData,
        }
      );
    },
  },
};
