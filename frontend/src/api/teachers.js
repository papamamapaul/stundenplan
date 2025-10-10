const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function fetchTeachers() {
  const res = await fetch('/teachers');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateTeacher(id, payload) {
  const res = await fetch(`/teachers/${id}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createTeacher(payload) {
  const res = await fetch('/teachers', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteTeacher(id) {
  const res = await fetch(`/teachers/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json ? res.json() : null;
}
