const AUTH_TOKEN_KEY = 'app-auth-token';
const subscribers = new Set();
const state = {
  token: null,
  user: null,
  loading: true,
  error: null,
};

const originalFetch = window.fetch.bind(window);

window.fetch = async (input, init = {}) => {
  const headers = new Headers(init.headers || {});
  if (state.token) {
    headers.set('Authorization', `Bearer ${state.token}`);
  }
  const response = await originalFetch(input, { ...init, headers });
  if (response.status === 401) {
    handleUnauthorized();
  }
  return response;
};

function notify() {
  const snapshot = { ...state, user: state.user ? { ...state.user } : null };
  subscribers.forEach(cb => cb(snapshot));
}

function persistToken(token) {
  if (token) {
    state.token = token;
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    state.token = null;
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

function handleUnauthorized() {
  if (!state.token || state.loading) return;
  persistToken(null);
  state.user = null;
  notify();
  if (window.location.hash !== '#/login') {
    redirectTo('#/login');
  }
}

export function subscribeAuth(cb) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export function getAuthState() {
  return { ...state, user: state.user ? { ...state.user } : null };
}

export function isAuthenticated() {
  return Boolean(state.token && state.user);
}

export async function initAuth() {
  const stored = localStorage.getItem(AUTH_TOKEN_KEY);
  if (stored) {
    state.token = stored;
    try {
      const profile = await fetchProfile();
      state.user = profile;
      state.loading = false;
      notify();
      return;
    } catch (err) {
      console.warn('Auth-Profil konnte nicht geladen werden:', err); // eslint-disable-line no-console
      persistToken(null);
    }
  }
  state.loading = false;
  notify();
}

export async function login(email, password) {
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: 'Login fehlgeschlagen' }));
    throw new Error(detail.detail || 'Login fehlgeschlagen');
  }
  const data = await res.json();
  persistToken(data.access_token);
  const profile = await fetchProfile();
  state.user = profile;
  state.loading = false;
  notify();
  redirectTo('#/plan/new');
}

export function logout() {
  persistToken(null);
  state.user = null;
  notify();
  redirectTo('#/login');
}

export async function fetchProfile() {
  const res = await fetch('/auth/me');
  if (!res.ok) {
    throw new Error('Profil konnte nicht geladen werden');
  }
  return res.json();
}

export async function fetchAdminUsers() {
  const res = await fetch('/admin/users');
  if (!res.ok) {
    throw new Error('Benutzer konnten nicht geladen werden');
  }
  return res.json();
}

export async function createAdminUser(payload) {
  const res = await fetch('/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: 'Benutzer konnte nicht erstellt werden' }));
    throw new Error(detail.detail || 'Benutzer konnte nicht erstellt werden');
  }
  return res.json();
}

function redirectTo(hash) {
  if (window.location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
}
