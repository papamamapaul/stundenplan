const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function exportSetup() {
  const res = await fetch('/backup/export/setup');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function importSetup(payload, { replace = false } = {}) {
  const params = new URLSearchParams();
  if (replace) params.set('replace', 'true');
  const res = await fetch(`/backup/import/setup?${params.toString()}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function exportDistribution(versionId) {
  const res = await fetch(`/backup/export/distribution?version_id=${encodeURIComponent(versionId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function importDistribution(payload, { replace = false } = {}) {
  const params = new URLSearchParams();
  if (replace) params.set('replace', 'true');
  const res = await fetch(`/backup/import/distribution?${params.toString()}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function exportBasisplan() {
  const res = await fetch('/backup/export/basisplan');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function importBasisplan(payload) {
  const res = await fetch('/backup/import/basisplan', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function exportPlans(planIds) {
  const params = new URLSearchParams();
  planIds.forEach(id => params.append('plan_ids', id));
  const res = await fetch(`/backup/export/plans?${params.toString()}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function importPlans(payload, { replace = false } = {}) {
  const params = new URLSearchParams();
  if (replace) params.set('replace', 'true');
  const res = await fetch(`/backup/import/plans?${params.toString()}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
