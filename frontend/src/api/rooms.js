const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function fetchRooms() {
  const res = await fetch('/rooms');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createRoom(payload) {
  const res = await fetch('/rooms', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateRoom(id, payload) {
  const res = await fetch(`/rooms/${id}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteRoom(id) {
  const res = await fetch(`/rooms/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json ? res.json() : null;
}
