import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { createApi } from './api';

// PUBLIC_INTERFACE
function App() {
  const [theme, setTheme] = useState('light');

  // Auth state
  const [token, setToken] = useState(() => window.localStorage.getItem('chat_token') || '');
  const [user, setUser] = useState(() => {
    const raw = window.localStorage.getItem('chat_user');
    return raw ? JSON.parse(raw) : null;
  });

  // UI state
  const [mode, setMode] = useState('login'); // login | signup
  const [form, setForm] = useState({ username: '', email: '', identifier: '', password: '' });
  const [roomId] = useState('global');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState({ kind: 'idle', message: '' });

  const api = useMemo(() => createApi({}), []);
  const wsRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    // Persist auth
    if (token) {
      window.localStorage.setItem('chat_token', token);
    } else {
      window.localStorage.removeItem('chat_token');
    }
    if (user) {
      window.localStorage.setItem('chat_user', JSON.stringify(user));
    } else {
      window.localStorage.removeItem('chat_user');
    }
  }, [token, user]);

  useEffect(() => {
    // If we have a token but no user (fresh reload), try /auth/me
    async function hydrate() {
      if (!token || user) return;
      try {
        const data = await api.me(token);
        setUser(data.user);
      } catch (e) {
        setToken('');
        setUser(null);
      }
    }
    hydrate();
  }, [api, token, user]);

  useEffect(() => {
    // Load history when authenticated
    async function load() {
      if (!token) return;
      try {
        const data = await api.listMessages({ token, roomId, limit: 50 });
        setMessages(data.messages || []);
      } catch (e) {
        // ignore
      }
    }
    load();
  }, [api, token, roomId]);

  useEffect(() => {
    // Connect WS when authenticated
    if (!token) return;

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = process.env.REACT_APP_WS_HOST || window.location.host;
    const wsUrl = `${proto}://${host}/ws?token=${encodeURIComponent(token)}&roomId=${encodeURIComponent(roomId)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setStatus({ kind: 'ok', message: 'Connected' });
    ws.onclose = () => setStatus({ kind: 'warn', message: 'Disconnected' });
    ws.onerror = () => setStatus({ kind: 'warn', message: 'Connection error' });

    ws.onmessage = (evt) => {
      const parsed = (() => {
        try {
          return JSON.parse(evt.data);
        } catch (e) {
          return null;
        }
      })();

      if (!parsed) return;

      if (parsed.type === 'message' && parsed.message) {
        setMessages((prev) => [...prev, parsed.message]);
      }
    };

    return () => {
      try {
        ws.close();
      } catch (e) {
        // ignore
      }
    };
  }, [token, roomId]);

  useEffect(() => {
    // Scroll to bottom on new messages
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // PUBLIC_INTERFACE
  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  function logout() {
    setToken('');
    setUser(null);
    setMessages([]);
    setDraft('');
    setStatus({ kind: 'idle', message: '' });
  }

  async function submitAuth(e) {
    e.preventDefault();
    setStatus({ kind: 'idle', message: '' });

    try {
      if (mode === 'signup') {
        const data = await api.signup({
          username: form.username,
          email: form.email,
          password: form.password,
        });
        setToken(data.token);
        setUser(data.user);
      } else {
        const data = await api.login({
          identifier: form.identifier,
          password: form.password,
        });
        setToken(data.token);
        setUser(data.user);
      }
    } catch (err) {
      setStatus({ kind: 'error', message: err.message || 'Auth failed' });
    }
  }

  async function sendMessage(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;

    setDraft('');

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'message', text, roomId }));
      return;
    }

    // Fallback to REST if WS not connected
    try {
      await api.postMessage({ token, roomId, text });
    } catch (err) {
      setStatus({ kind: 'error', message: err.message || 'Failed to send message' });
    }
  }

  const isAuthed = Boolean(token);

  return (
    <div className="App">
      <div className="topbar">
        <div className="brand">
          <div className="brand-title">Simple Chat</div>
          <div className="brand-subtitle">REST + WebSocket + MongoDB</div>
        </div>

        <div className="topbar-actions">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? 'Dark' : 'Light'}
          </button>

          {isAuthed ? (
            <button className="btn secondary" onClick={logout}>
              Logout
            </button>
          ) : null}
        </div>
      </div>

      {!isAuthed ? (
        <main className="auth-shell">
          <div className="card">
            <h1 className="h1">{mode === 'signup' ? 'Create account' : 'Log in'}</h1>
            <p className="muted">
              {mode === 'signup' ? 'Sign up to join the global room.' : 'Log in to continue.'}
            </p>

            <form onSubmit={submitAuth} className="form">
              {mode === 'signup' ? (
                <>
                  <label className="label">
                    Username
                    <input
                      className="input"
                      value={form.username}
                      onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                      autoComplete="username"
                      required
                    />
                  </label>

                  <label className="label">
                    Email
                    <input
                      className="input"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                      autoComplete="email"
                      required
                    />
                  </label>
                </>
              ) : (
                <label className="label">
                  Email or Username
                  <input
                    className="input"
                    value={form.identifier}
                    onChange={(e) => setForm((p) => ({ ...p, identifier: e.target.value }))}
                    autoComplete="username"
                    required
                  />
                </label>
              )}

              <label className="label">
                Password
                <input
                  className="input"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                />
              </label>

              {status.kind === 'error' ? <div className="alert error">{status.message}</div> : null}

              <button className="btn primary" type="submit">
                {mode === 'signup' ? 'Sign up' : 'Log in'}
              </button>
            </form>

            <div className="switcher">
              {mode === 'signup' ? (
                <button className="link" onClick={() => setMode('login')} type="button">
                  Have an account? Log in
                </button>
              ) : (
                <button className="link" onClick={() => setMode('signup')} type="button">
                  New here? Create an account
                </button>
              )}
            </div>
          </div>
        </main>
      ) : (
        <main className="chat-shell">
          <div className="chat-header">
            <div>
              <div className="h2">Room: {roomId}</div>
              <div className="muted">Signed in as <strong>{user?.username || 'user'}</strong></div>
            </div>
            <div className={`pill ${status.kind}`}>{status.message || 'Ready'}</div>
          </div>

          <div className="chat-card">
            <div className="messages" ref={listRef} aria-label="Message list">
              {messages.map((m) => (
                <div key={m.id} className={`msg ${m.username === user?.username ? 'mine' : ''}`}>
                  <div className="meta">
                    <span className="who">{m.username}</span>
                    <span className="when">{new Date(m.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <div className="text">{m.text}</div>
                </div>
              ))}
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <input
                className="input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message…"
                aria-label="Message input"
              />
              <button className="btn primary" type="submit">
                Send
              </button>
            </form>
          </div>
        </main>
      )}
    </div>
  );
}

export default App;
