import { buildAccountQuery } from './helpers.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function fetchClasses() {
  const query = buildAccountQuery();
  const res = await fetch(`/classes${query}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createClass(payload) {
  const query = buildAccountQuery();
  const res = await fetch(`/classes${query}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateClass(id, payload) {
  const query = buildAccountQuery();
  const res = await fetch(`/classes/${id}${query}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteClass(id) {
  const query = buildAccountQuery();
  const res = await fetch(`/classes/${id}${query}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json ? res.json() : null;
}
