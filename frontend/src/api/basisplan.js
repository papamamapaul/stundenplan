const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function fetchBasisplan() {
  const res = await fetch('/basisplan');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateBasisplan(payload) {
  const res = await fetch('/basisplan', {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
