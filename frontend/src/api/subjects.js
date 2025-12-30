import { buildAccountQuery } from './helpers.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function fetchSubjects() {
  const query = buildAccountQuery();
  const res = await fetch(`/subjects${query}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function createSubject(payload) {
  const query = buildAccountQuery();
  const res = await fetch(`/subjects${query}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function updateSubject(id, payload) {
  const query = buildAccountQuery();
  const res = await fetch(`/subjects/${id}${query}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function deleteSubject(id) {
  const query = buildAccountQuery();
  const res = await fetch(`/subjects/${id}${query}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json ? res.json() : null;
}

export {
  fetchSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
};
