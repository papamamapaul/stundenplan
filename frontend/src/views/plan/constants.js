export const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];

export const STUNDEN = Array.from({ length: 8 }, (_, idx) => idx + 1);

export const DAY_LABELS = {
  Mo: 'Montag',
  Di: 'Dienstag',
  Mi: 'Mittwoch',
  Do: 'Donnerstag',
  Fr: 'Freitag',
};

export const DEFAULT_PARAMS = {
  multi_start: true,
  max_attempts: 10,
  patience: 3,
  time_per_attempt: 5.0,
  randomize_search: true,
  base_seed: 42,
  seed_step: 17,
  use_value_hints: true,
};

export const RULE_DEFAULTS_STORAGE_KEY = 'plan-view-rule-defaults-v1';

export const RULE_GROUPS = [
  {
    id: 'core',
    label: 'Basisregeln',
    description: 'Sorgt dafür, dass alle Anforderungen ohne Konflikte erfüllt werden.',
    keys: ['stundenbedarf_vollstaendig', 'keine_lehrerkonflikte', 'keine_klassenkonflikte', 'raum_verfuegbarkeit'],
  },
  {
    id: 'basisplan',
    label: 'Basisplan & Rahmen',
    description: 'Übernimmt Vorgaben aus dem Basisplan und legt Nachmittagsfenster fest.',
    keys: ['basisplan_fixed', 'basisplan_flexible', 'basisplan_windows', 'nachmittag_pause_stunde'],
  },
  {
    id: 'struktur',
    label: 'Tagesstruktur',
    description: 'Regelt Grenzen je Tag und besondere Vorgaben für Vormittag/Nachmittag.',
    keys: ['stundenbegrenzung', 'stundenbegrenzung_erste_stunde', 'mittagsschule_vormittag', 'fach_nachmittag_regeln'],
  },
  {
    id: 'unterricht',
    label: 'Unterrichtsblöcke',
    description: 'Definiert Regeln für Doppelstunden und Bandunterrichte.',
    keys: ['doppelstundenregel', 'einzelstunde_nur_rand', 'bandstunden_parallel', 'band_lehrer_parallel'],
  },
  {
    id: 'verteilung',
    label: 'Verteilung & Hohlstunden',
    description: 'Steuert Lücken in Klassenstunden und die Gleichverteilung über die Woche.',
    keys: ['keine_hohlstunden', 'keine_hohlstunden_hard', 'gleichverteilung'],
  },
  {
    id: 'lehrer',
    label: 'Lehrkräfte',
    description: 'Optimiert Freistunden von Lehrkräften.',
    keys: ['lehrer_arbeitstage', 'lehrer_hohlstunden_soft'],
  },
];

export const RULE_EXTRAS = {
  keine_hohlstunden: ['W_GAPS_START', 'W_GAPS_INSIDE'],
  gleichverteilung: ['W_EVEN_DIST'],
  doppelstundenregel: ['W_EINZEL_KANN', 'W_EINZEL_SOLL'],
  bandstunden_parallel: ['W_BAND_OPTIONAL'],
  lehrer_hohlstunden_soft: ['TEACHER_GAPS_DAY_MAX', 'TEACHER_GAPS_WEEK_MAX', 'W_TEACHER_GAPS'],
};

export function defaultPlanName() {
  const now = new Date();
  return `Plan ${now.toLocaleDateString()} ${now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })}`;
}
