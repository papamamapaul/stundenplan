export async function fetchRuleProfiles() {
  const res = await fetch('/rule-profiles');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
