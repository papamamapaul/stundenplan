import { buildAccountQuery } from './helpers.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function fetchTeachers() {
  const query = buildAccountQuery();
  const res = await fetch(`/teachers${query}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateTeacher(id, payload) {
  const query = buildAccountQuery();
  const res = await fetch(`/teachers/${id}${query}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createTeacher(payload) {
  const query = buildAccountQuery();
  const res = await fetch(`/teachers${query}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteTeacher(id) {
  const query = buildAccountQuery();
  const res = await fetch(`/teachers/${id}${query}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json ? res.json() : null;
}
