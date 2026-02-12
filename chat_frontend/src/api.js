/**
 * PUBLIC_INTERFACE
 * API helper for REST calls to the backend.
 */
export function createApi({ baseUrl } = {}) {
  const apiBase = baseUrl || process.env.REACT_APP_API_BASE_URL || '';

  async function request(path, { method = 'GET', token, body } = {}) {
    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.message || `Request failed: ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  return {
    signup: (payload) => request('/auth/signup', { method: 'POST', body: payload }),
    login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
    me: (token) => request('/auth/me', { token }),
    listMessages: ({ token, roomId = 'global', limit = 50 }) =>
      request(`/messages?roomId=${encodeURIComponent(roomId)}&limit=${encodeURIComponent(limit)}`, { token }),
    postMessage: ({ token, roomId = 'global', text }) =>
      request('/messages', { method: 'POST', token, body: { roomId, text } }),
  };
}
