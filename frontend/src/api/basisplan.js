import { buildAccountQuery } from './helpers.js';
import { getActivePlanningPeriodId } from '../store/planningPeriods.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function periodQuery() {
  const periodId = getActivePlanningPeriodId();
  return buildAccountQuery({ planning_period_id: periodId != null ? periodId : undefined });
}

export async function fetchBasisplan() {
  const query = periodQuery();
  const res = await fetch(`/basisplan${query}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateBasisplan(payload) {
  const query = periodQuery();
  const res = await fetch(`/basisplan${query}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function previewBasisplan(payload) {
  const query = periodQuery();
  const res = await fetch(`/basisplan/debug/parse${query}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload ? { payload } : {}),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
