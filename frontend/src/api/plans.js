const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function fetchPlanRules() {
  const res = await fetch('/plans/rules');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchPlans() {
  const res = await fetch('/plans');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchPlanDetail(planId) {
  const res = await fetch(`/plans/${planId}`);
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

  const res = await fetch('/plans/generate', {
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
  const res = await fetch(`/plans/${planId}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deletePlan(planId) {
  const res = await fetch(`/plans/${planId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await res.text());
}
