import { buildAccountQuery } from './helpers.js';
import { getActivePlanningPeriodId } from '../store/planningPeriods.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function periodQuery(params = {}) {
  const periodId = getActivePlanningPeriodId();
  const merged = { ...params };
  if (periodId != null) merged.planning_period_id = periodId;
  return buildAccountQuery(merged);
}

export async function exportSetup() {
  const query = buildAccountQuery();
  const res = await fetch(`/backup/export/setup${query}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function importSetup(payload, { replace = false } = {}) {
  const query = buildAccountQuery({
    replace: replace ? 'true' : undefined,
  });
  const res = await fetch(`/backup/import/setup${query}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function exportDistribution(versionId) {
  const query = buildAccountQuery({ version_id: versionId });
  const res = await fetch(`/backup/export/distribution${query}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function importDistribution(payload, { replace = false } = {}) {
  const query = buildAccountQuery({
    replace: replace ? 'true' : undefined,
  });
  const res = await fetch(`/backup/import/distribution${query}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function exportBasisplan() {
  const query = periodQuery();
  const res = await fetch(`/backup/export/basisplan${query}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function importBasisplan(payload) {
  const query = periodQuery();
  const res = await fetch(`/backup/import/basisplan${query}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function exportPlans(planIds) {
  const query = buildAccountQuery({ plan_ids: planIds });
  const res = await fetch(`/backup/export/plans${query}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function importPlans(payload, { replace = false } = {}) {
  const query = buildAccountQuery({
    replace: replace ? 'true' : undefined,
  });
  const res = await fetch(`/backup/import/plans${query}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
