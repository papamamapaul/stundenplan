const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function fetchCurriculum() {
  const res = await fetch('/curriculum');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateCurriculum(id, payload) {
  const res = await fetch(`/curriculum/${id}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createCurriculum(payload) {
  const res = await fetch('/curriculum', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteCurriculum(id) {
  const res = await fetch(`/curriculum/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json ? res.json() : null;
}
