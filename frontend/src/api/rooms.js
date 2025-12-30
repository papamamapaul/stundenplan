import { buildAccountQuery } from './helpers.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function fetchRooms() {
  const query = buildAccountQuery();
  const res = await fetch(`/rooms${query}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createRoom(payload) {
  const query = buildAccountQuery();
  const res = await fetch(`/rooms${query}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateRoom(id, payload) {
  const query = buildAccountQuery();
  const res = await fetch(`/rooms/${id}${query}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteRoom(id) {
  const query = buildAccountQuery();
  const res = await fetch(`/rooms/${id}${query}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json ? res.json() : null;
}
