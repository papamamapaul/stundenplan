import { buildAccountQuery } from './helpers.js';

async function handleJson(res, fallbackMessage) {
  if (res.ok) return res.json();
  const detail = await res.json().catch(() => ({}));
  throw new Error(detail.detail || fallbackMessage);
}

export async function fetchAccounts() {
  const res = await fetch('/admin/accounts');
  return handleJson(res, 'Schulen konnten nicht geladen werden');
}

export async function createAccount(payload) {
  const res = await fetch('/admin/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleJson(res, 'Schule konnte nicht angelegt werden');
}

export async function fetchAccountUsers(params = {}) {
  const query = buildAccountQuery(params);
  const res = await fetch(`/account-admin/users${query}`);
  return handleJson(res, 'Benutzerliste konnte nicht geladen werden');
}

export async function createAccountUser(payload, params = {}) {
  const query = buildAccountQuery(params);
  const res = await fetch(`/account-admin/users${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleJson(res, 'Benutzer konnte nicht angelegt werden');
}
