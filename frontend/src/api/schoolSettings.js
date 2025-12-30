import { buildAccountQuery } from './helpers.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function fetchSchoolSettings() {
  const query = buildAccountQuery();
  const res = await fetch(`/settings/school${query}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateSchoolSettings(payload) {
  const query = buildAccountQuery();
  const res = await fetch(`/settings/school${query}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
