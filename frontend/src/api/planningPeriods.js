import { buildAccountQuery } from './helpers.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function fetchPlanningPeriods({ include_inactive = true } = {}) {
  const query = buildAccountQuery({
    include_inactive: include_inactive ? 'true' : undefined,
  });
  const res = await fetch(`/planning-periods${query}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createPlanningPeriod(payload) {
  const query = buildAccountQuery();
  const res = await fetch(`/planning-periods${query}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updatePlanningPeriod(id, payload) {
  const query = buildAccountQuery();
  const res = await fetch(`/planning-periods/${id}${query}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deletePlanningPeriod(id) {
  const query = buildAccountQuery();
  const res = await fetch(`/planning-periods/${id}${query}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json ? res.json() : null;
}

export async function clonePlanningPeriod(id, payload) {
  const query = buildAccountQuery();
  const res = await fetch(`/planning-periods/${id}/clone${query}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
