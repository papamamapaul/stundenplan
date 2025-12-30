import { buildAccountQuery } from './helpers.js';
import { getActivePlanningPeriodId } from '../store/planningPeriods.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function periodQuery() {
  const periodId = getActivePlanningPeriodId();
  return buildAccountQuery({ planning_period_id: periodId != null ? periodId : undefined });
}

export async function fetchVersions() {
  const query = periodQuery();
  const res = await fetch(`/versions${query}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createVersion(payload) {
  const query = periodQuery();
  const res = await fetch(`/versions${query}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateVersion(id, payload) {
  const query = periodQuery();
  const res = await fetch(`/versions/${id}${query}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteVersion(id) {
  const query = periodQuery();
  const res = await fetch(`/versions/${id}${query}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json ? res.json() : null;
}
