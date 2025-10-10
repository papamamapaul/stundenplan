const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function fetchRequirements(params = {}) {
  const search = new URLSearchParams();
  if (params.version_id != null) {
    search.set('version_id', params.version_id);
  }
  const query = search.toString();
  const url = query ? `/requirements?${query}` : '/requirements';
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createRequirement(payload) {
  const res = await fetch('/requirements', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateRequirement(id, payload) {
  const res = await fetch(`/requirements/${id}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteRequirement(id) {
  const res = await fetch(`/requirements/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json ? res.json() : null;
}
