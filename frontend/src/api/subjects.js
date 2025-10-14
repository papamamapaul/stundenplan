const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function fetchSubjects() {
  const res = await fetch('/subjects');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function createSubject(payload) {
  const res = await fetch('/subjects', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function updateSubject(id, payload) {
  const res = await fetch(`/subjects/${id}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function deleteSubject(id) {
  const res = await fetch(`/subjects/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json ? res.json() : null;
}

export {
  fetchSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
};
