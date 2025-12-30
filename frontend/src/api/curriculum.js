import { buildAccountQuery } from './helpers.js';
import { getActivePlanningPeriodId } from '../store/planningPeriods.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function periodQuery() {
  const periodId = getActivePlanningPeriodId();
  return buildAccountQuery({ planning_period_id: periodId != null ? periodId : undefined });
}

export async function fetchCurriculum() {
  const query = periodQuery();
  const res = await fetch(`/curriculum${query}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateCurriculum(id, payload) {
  const query = periodQuery();
  const res = await fetch(`/curriculum/${id}${query}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createCurriculum(payload) {
  const query = periodQuery();
  const res = await fetch(`/curriculum${query}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteCurriculum(id) {
  const query = periodQuery();
  const res = await fetch(`/curriculum/${id}${query}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json ? res.json() : null;
}
