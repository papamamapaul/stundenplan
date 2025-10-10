const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function fetchVersions() {
  const res = await fetch('/versions');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createVersion(payload) {
  const res = await fetch('/versions', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateVersion(id, payload) {
  const res = await fetch(`/versions/${id}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteVersion(id) {
  const res = await fetch(`/versions/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json ? res.json() : null;
}
