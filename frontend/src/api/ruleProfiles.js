import { buildAccountQuery } from './helpers.js';

export async function fetchRuleProfiles() {
  const query = buildAccountQuery();
  const res = await fetch(`/rule-profiles${query}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
