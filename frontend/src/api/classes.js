const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function fetchClasses() {
  const res = await fetch('/classes');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createClass(payload) {
  const res = await fetch('/classes', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateClass(id, payload) {
  const res = await fetch(`/classes/${id}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
