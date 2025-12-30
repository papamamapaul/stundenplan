export const TEACHER_COLOR_PALETTE = [
  '#2563EB',
  '#DC2626',
  '#16A34A',
  '#9333EA',
  '#F97316',
  '#0D9488',
  '#FACC15',
  '#EC4899',
  '#14B8A6',
  '#6366F1',
  '#EF4444',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#FB7185',
  '#0891B2',
  '#22C55E',
  '#7C3AED',
  '#F973AB',
  '#1D4ED8',
];

export function normalizeTeacherColor(color) {
  if (!color) return null;
  const trimmed = String(color).trim();
  if (!trimmed) return null;
  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (hex.length !== 6) return null;
  const value = Number.parseInt(hex, 16);
  if (Number.isNaN(value)) return null;
  return `#${hex.toUpperCase()}`;
}

export function pickNextTeacherColor(teachers = []) {
  const used = new Set(
    teachers
      .map(t => normalizeTeacherColor(t?.color))
      .filter(Boolean),
  );
  for (const candidate of TEACHER_COLOR_PALETTE) {
    const normalized = normalizeTeacherColor(candidate);
    if (normalized && !used.has(normalized)) {
      return normalized;
    }
  }
  const fallbackIndex = used.size % TEACHER_COLOR_PALETTE.length;
  const fallback = normalizeTeacherColor(TEACHER_COLOR_PALETTE[fallbackIndex]);
  return fallback || '#1F2937';
}
