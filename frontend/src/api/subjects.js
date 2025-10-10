export async function fetchSubjects() {
  const res = await fetch('/subjects');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
