import { buildAccountQuery } from './helpers.js';
import { getActivePlanningPeriodId } from '../store/planningPeriods.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function periodQuery(params = {}) {
  const periodId = getActivePlanningPeriodId();
  const merged = { ...params };
  if (periodId != null) merged.planning_period_id = periodId;
  return buildAccountQuery(merged);
}

export async function fetchRequirements(params = {}) {
  const query = periodQuery({ version_id: params.version_id });
  const url = `/requirements${query}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createRequirement(payload) {
  const query = periodQuery();
  const res = await fetch(`/requirements${query}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateRequirement(id, payload) {
  const query = periodQuery();
  const res = await fetch(`/requirements/${id}${query}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteRequirement(id) {
  const query = periodQuery();
  const res = await fetch(`/requirements/${id}${query}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json ? res.json() : null;
}
