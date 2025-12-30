import { buildAccountQuery } from './helpers.js';
import { getActivePlanningPeriodId } from '../store/planningPeriods.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function withPlanningPeriod(params = {}) {
  const periodId = getActivePlanningPeriodId();
  const merged = { ...params };
  if (periodId != null) merged.planning_period_id = periodId;
  return buildAccountQuery(merged);
}

export async function fetchPlanRules() {
  const res = await fetch('/plans/rules');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchPlans() {
  const query = withPlanningPeriod();
  const res = await fetch(`/plans${query}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchPlanDetail(planId) {
  const query = withPlanningPeriod();
  const res = await fetch(`/plans/${planId}${query}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function generatePlan(payload) {
  const cleaned = { ...payload };
  if (!cleaned.override_rules || !Object.keys(cleaned.override_rules).length) {
    delete cleaned.override_rules;
  }
  if (cleaned.version_id == null) delete cleaned.version_id;
  if (cleaned.rule_profile_id == null) delete cleaned.rule_profile_id;
  if (!cleaned.dry_run) delete cleaned.dry_run;
  if (cleaned.comment != null) {
    cleaned.comment = cleaned.comment.trim();
    if (!cleaned.comment.length) delete cleaned.comment;
  }

  // eslint-disable-next-line no-console
  console.debug('POST /plans/generate', cleaned);

  const query = withPlanningPeriod();
  const res = await fetch(`/plans/generate${query}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(cleaned),
  });
  if (!res.ok) {
    const text = await res.text();
    // eslint-disable-next-line no-console
    console.error('generatePlan failed', res.status, text);
    throw new Error(text);
  }
  return res.json();
}

export async function updatePlan(planId, payload) {
  const query = withPlanningPeriod();
  const res = await fetch(`/plans/${planId}${query}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updatePlanSlots(planId, slots) {
  const query = withPlanningPeriod();
  const res = await fetch(`/plans/${planId}/slots${query}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ slots }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deletePlan(planId) {
  const query = withPlanningPeriod();
  const res = await fetch(`/plans/${planId}${query}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await res.text());
}
