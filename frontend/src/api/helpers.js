const ACCOUNT_STORAGE_KEY = 'app-account-id';
const DEFAULT_ACCOUNT_ID = 1;

export function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value
        .filter(item => item !== undefined && item !== null)
        .forEach(item => search.append(key, item));
      return;
    }
    const normalized = typeof value === 'boolean' ? (value ? 'true' : 'false') : value;
    if (normalized === '') return;
    search.set(key, normalized);
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function getCurrentAccountId() {
  if (typeof window !== 'undefined') {
    const fromWindow = window.APP_ACCOUNT_ID ?? window.APP_ACCOUNT ?? window.APP_ACCOUNT_ID_DEFAULT;
    const resolved = normalizeAccountId(fromWindow);
    if (resolved != null) return resolved;
    try {
      const stored = window.localStorage?.getItem(ACCOUNT_STORAGE_KEY);
      const storedId = normalizeAccountId(stored);
      if (storedId != null) return storedId;
    } catch {
      // ignore storage errors
    }
  }
  return DEFAULT_ACCOUNT_ID;
}

function normalizeAccountId(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function withAccountParams(params = {}) {
  const merged = { ...params };
  const accountId = getCurrentAccountId();
  if (accountId != null) merged.account_id = accountId;
  return merged;
}

export function buildAccountQuery(params = {}) {
  return buildQuery(withAccountParams(params));
}
