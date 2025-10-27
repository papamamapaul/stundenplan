import { fetchPlanRules, fetchPlanDetail, generatePlan, updatePlan, updatePlanSlots } from '../api/plans.js';
import { createPlanGrid } from '../components/PlanGrid.js';
import { fetchRuleProfiles } from '../api/ruleProfiles.js';
import { fetchVersions } from '../api/versions.js';
import { fetchSubjects } from '../api/subjects.js';
import { fetchClasses } from '../api/classes.js';
import { fetchTeachers } from '../api/teachers.js';
import { formatError, formModal } from '../utils/ui.js';
import { createTabs } from '../components/Tabs.js';
import { openPlanPrintModal } from '../components/PlanPrintModal.js';

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
const STUNDEN = Array.from({ length: 8 }, (_, idx) => idx + 1);
const DAY_LABELS = {
  Mo: 'Montag',
  Di: 'Dienstag',
  Mi: 'Mittwoch',
  Do: 'Donnerstag',
  Fr: 'Freitag',
};
const DEFAULT_PARAMS = {
  multi_start: true,
  max_attempts: 10,
  patience: 3,
  time_per_attempt: 5.0,
  randomize_search: true,
  base_seed: 42,
  seed_step: 17,
  use_value_hints: true,
};

const RULE_DEFAULTS_STORAGE_KEY = 'plan-view-rule-defaults-v1';

const RULE_GROUPS = [
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

const RULE_EXTRAS = {
  keine_hohlstunden: ['W_GAPS_START', 'W_GAPS_INSIDE'],
  gleichverteilung: ['W_EVEN_DIST'],
  doppelstundenregel: ['W_EINZEL_KANN'],
  lehrer_hohlstunden_soft: ['TEACHER_GAPS_DAY_MAX', 'TEACHER_GAPS_WEEK_MAX', 'W_TEACHER_GAPS'],
};

function defaultPlanName() {
  const now = new Date();
  return `Plan ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function createPlanView() {
  const hash = window.location.hash || '';
  const planIdMatch = hash.match(/^#\/plan\/(\d+)/);
  const initialPlanId = planIdMatch ? Number(planIdMatch[1]) : null;

  const container = document.createElement('section');
  container.className = 'space-y-6';

  const header = document.createElement('div');
  header.className = 'space-y-1';
  header.innerHTML = `
    <h1 class="text-2xl font-semibold">Planberechnung</h1>
    <p class="text-sm opacity-70">Wähle eine Stundenverteilung, konfiguriere Regeln und generiere Planvarianten.</p>
  `;

  const statusBar = createStatusBar();

  const versionSelect = document.createElement('select');
  versionSelect.className = 'select select-bordered w-full';

  const ruleProfileSelect = document.createElement('select');
  ruleProfileSelect.className = 'select select-bordered w-full';

  const configCard = document.createElement('article');
  configCard.className = 'card bg-base-100 shadow-sm border border-base-200';
  const configBody = document.createElement('div');
  configBody.className = 'card-body space-y-6';
  configCard.appendChild(configBody);

  const configIntro = document.createElement('div');
  configIntro.className = 'space-y-1';
  configIntro.innerHTML = `
    <h2 class="card-title text-lg">1. Regeln & Gewichtungen festlegen</h2>
    <p class="text-sm opacity-70">Wähle zunächst die zugrunde liegende Stundenverteilung und passe anschließend Regeln sowie Gewichtungen an.</p>
  `;
  configBody.appendChild(configIntro);

  const selectionGrid = document.createElement('div');
  selectionGrid.className = 'grid gap-4 lg:grid-cols-2';
  selectionGrid.append(
    createField('Stundenverteilung', versionSelect),
    createField('Regelprofil', ruleProfileSelect),
  );
  configBody.appendChild(selectionGrid);

  const rulesContainer = document.createElement('div');
  rulesContainer.className = 'space-y-6';
  configBody.appendChild(rulesContainer);

  const configFooter = document.createElement('div');
  configFooter.className = 'flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pt-2';

  const infoWrap = document.createElement('div');
  infoWrap.className = 'flex flex-col gap-2';
  const badgeWrap = document.createElement('div');
  badgeWrap.className = 'flex flex-wrap items-center gap-2';
  infoWrap.appendChild(badgeWrap);
  configFooter.appendChild(infoWrap);

  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'flex flex-wrap items-center gap-3';
  configFooter.appendChild(actionsWrap);

  configBody.appendChild(configFooter);

  const resultsSection = document.createElement('div');
  resultsSection.className = 'space-y-4';

  const editingSection = document.createElement('div');
  editingSection.className = 'space-y-4 hidden';

  const tabs = createTabs([
    { id: 'results', label: 'Ergebnisse' },
    { id: 'analysis', label: 'Analyse' },
  ]);

  const tabContent = document.createElement('div');
  tabContent.className = 'mt-4';

  const analysisSection = document.createElement('div');
  analysisSection.className = 'space-y-4 hidden';

  tabContent.append(resultsSection, analysisSection);

  const debugCard = document.createElement('article');
  debugCard.className = 'card bg-base-100 shadow-sm border border-dashed border-base-300';
  const debugBody = document.createElement('div');
  debugBody.className = 'card-body space-y-4';
  const debugHeader = document.createElement('div');
  debugHeader.className = 'flex items-start justify-between gap-3';
  const debugTitleWrap = document.createElement('div');
  debugTitleWrap.className = 'space-y-1';
  const debugTitle = document.createElement('h2');
  debugTitle.className = 'text-lg font-semibold';
  debugTitle.textContent = 'Solver-Diagnose';
  const debugText = document.createElement('p');
  debugText.className = 'text-xs opacity-70 max-w-xl';
  debugText.textContent = 'Starte Trockenläufe, um zu prüfen, welche Regel-Kombination eine Lösung verhindert. Jeder Lauf nutzt die aktuelle Stundenverteilung und speichert keinen Plan.';
  debugTitleWrap.append(debugTitle, debugText);

  const debugButton = document.createElement('button');
  debugButton.type = 'button';
  debugButton.className = 'btn btn-sm btn-outline';
  debugButton.textContent = 'Regel-Check starten';
  debugHeader.append(debugTitleWrap, debugButton);

  const debugStatus = document.createElement('p');
  debugStatus.className = 'text-xs opacity-70';
  debugStatus.textContent = 'Noch kein Debug-Lauf gestartet.';

  const debugResults = document.createElement('div');
  debugResults.className = 'overflow-x-auto';

  debugBody.append(debugHeader, debugStatus, debugResults);
  debugCard.append(debugBody);

  const solverContainer = document.createElement('div');
  solverContainer.className = 'space-y-4';

  const advancedCard = document.createElement('article');
  advancedCard.className = 'card bg-base-100 shadow-sm border border-base-200';
  const advancedBody = document.createElement('div');
  advancedBody.className = 'card-body space-y-4';

  const advancedDetails = document.createElement('details');
  advancedDetails.className = 'collapse collapse-arrow bg-base-200/60 rounded-xl';
  const advancedSummary = document.createElement('summary');
  advancedSummary.className = 'collapse-title text-sm font-semibold cursor-pointer';
  advancedSummary.textContent = '2. Erweiterte Einstellungen & Regelsimulation';
  const advancedContent = document.createElement('div');
  advancedContent.className = 'collapse-content space-y-6';
  advancedContent.appendChild(solverContainer);
  const debugWrap = document.createElement('div');
  debugWrap.appendChild(debugCard);
  advancedContent.appendChild(debugWrap);
  advancedDetails.append(advancedSummary, advancedContent);
  advancedBody.appendChild(advancedDetails);
  advancedCard.appendChild(advancedBody);

  container.append(header, statusBar.element, configCard, advancedCard, tabs.nav, tabContent);

  const state = {
    loading: false,
    generating: false,
    versions: [],
    selectedVersionId: null,
    ruleProfiles: [],
    selectedRuleProfileId: null,
    rulesDefinition: null,
    ruleBaseBools: new Map(),
    ruleBaseWeights: new Map(),
    ruleValuesBools: new Map(),
    ruleValuesWeights: new Map(),
    ruleDefinitionByKey: new Map(),
    ruleExtraContainers: new Map(),
    ruleBackendDefaultsBools: new Map(),
    ruleBackendDefaultsWeights: new Map(),
    planName: defaultPlanName(),
    planComment: '',
    generatedPlans: [],
    lastPlanId: null,
    subjects: new Map(),
    classes: new Map(),
    teachers: new Map(),
    boolInputs: new Map(),
    weightInputs: new Map(),
    params: { ...DEFAULT_PARAMS },
    paramInputs: new Map(),
    analysis: null,
    analysisError: null,
    activeTab: 'results',
    debugRuns: [],
    debugRunning: false,
    debugStale: true,
    visibleClasses: new Set(),
    initialPlanId,
    ruleGroupSections: new Map(),
    ruleGroupCollapsed: new Map(),
    editing: null,
    editingParkingSeq: 0,
    dragPayload: null,
    highlightedTeacherId: null,
  };

  const progressModal = createProgressModal();

  const rulesProfileBadge = document.createElement('span');
  rulesProfileBadge.className = 'badge badge-outline';
  rulesProfileBadge.textContent = 'Profil: Standard';

  const rulesOverridesBadge = document.createElement('span');
  rulesOverridesBadge.className = 'badge badge-outline';
  rulesOverridesBadge.textContent = 'Overrides: 0';

  const rulesSummaryInfo = document.createElement('p');
  rulesSummaryInfo.className = 'text-xs opacity-60';
  rulesSummaryInfo.textContent = 'Regelprofil bestimmt die Ausgangswerte. Änderungen gelten nur für die nächste Berechnung.';
  infoWrap.appendChild(rulesSummaryInfo);
  badgeWrap.append(rulesProfileBadge, rulesOverridesBadge);

  const generateButton = document.createElement('button');
  generateButton.type = 'button';
  generateButton.className = 'btn btn-primary';
  generateButton.textContent = 'Plan erstellen';
  actionsWrap.appendChild(generateButton);

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'btn btn-outline btn-sm';
  saveButton.textContent = 'Speichern unter…';
  saveButton.disabled = true;

  versionSelect.addEventListener('change', () => {
    state.selectedVersionId = versionSelect.value ? Number(versionSelect.value) : null;
    loadAnalysis().then(renderAnalysis).catch(() => {});
    syncParamControls();
    updateRulesSummary();
    markDebugStale();
  });

  ruleProfileSelect.addEventListener('change', () => {
    const value = ruleProfileSelect.value ? Number(ruleProfileSelect.value) : null;
    state.selectedRuleProfileId = Number.isNaN(value) ? null : value;
    applyRuleProfile();
    syncRuleControls();
    updateRulesSummary();
    markDebugStale();
  });

  generateButton.addEventListener('click', async () => {
    if (state.generating) return;
    if (!state.selectedVersionId) {
      statusBar.set('Bitte zuerst eine Stundenverteilung auswählen.', true);
      return;
    }
    await handleGenerate();
  });

  saveButton.addEventListener('click', async () => {
    if (!state.lastPlanId) return;
    const values = await formModal({
      title: 'Plan speichern',
      message: 'Titel und Kommentar festlegen.',
      confirmText: 'Speichern',
      fields: [
        { name: 'name', label: 'Planname*', required: true, value: state.planName },
        { name: 'comment', label: 'Kommentar', type: 'textarea', value: state.planComment },
      ],
      validate: ({ name }) => {
        if (!name || name.trim().length < 3) return 'Bitte einen aussagekräftigen Namen angeben (min. 3 Zeichen).';
        return null;
      },
    });
    if (!values) return;
    await handleSave(values.name.trim(), (values.comment || '').trim());
  });

  debugButton.addEventListener('click', async () => {
    if (state.debugRunning) return;
    await runRuleDiagnostics();
  });

  initialize().catch(err => {
    statusBar.set(`Fehler beim Laden: ${formatError(err)}`, true);
  });

  async function initialize() {
    statusBar.set('Lade Daten…');
    state.loading = true;
    try {
      const [versions, rules, profiles, subjects, classes, teachers] = await Promise.all([
        fetchVersions(),
        fetchPlanRules(),
        fetchRuleProfiles(),
        fetchSubjects(),
        fetchClasses(),
        fetchTeachers(),
      ]);
      state.versions = versions;
      state.selectedVersionId = versions[0]?.id ?? null;
      state.ruleProfiles = profiles;
      state.rulesDefinition = rules;
      state.ruleDefinitionByKey = new Map();
      (rules?.bools || []).forEach(rule => {
        state.ruleDefinitionByKey.set(rule.key, rule);
      });
      (rules?.weights || []).forEach(rule => {
        state.ruleDefinitionByKey.set(rule.key, rule);
      });
      state.subjects = new Map(subjects.map(sub => [sub.id, sub]));
      state.classes = new Map(classes.map(cls => [cls.id, cls]));
      state.teachers = new Map(teachers.map(t => [t.id, t]));
      state.visibleClasses = new Set(classes.map(cls => cls.id));

      initializeRuleValues();
      loadPersistedRuleDefaults();
      renderRuleProfiles();
      renderRules();
      renderSolverControls();
      renderVersionOptions();
      syncRuleControls();
      syncParamControls();
      if (initialPlanId) {
        await loadExistingPlan(initialPlanId);
      } else {
        renderResults();
      }
      await loadAnalysis();
      renderAnalysis();
      renderDebugResults();
      statusBar.set('Daten geladen.');
      setTimeout(statusBar.clear, 1200);
    } catch (err) {
      statusBar.set(`Fehler beim Laden: ${formatError(err)}`, true);
    } finally {
      state.loading = false;
    }
  }

  async function loadExistingPlan(planId) {
    try {
      statusBar.set('Lade Plan…');
      const detail = await fetchPlanDetail(planId);
      if (detail.version_id != null) {
        state.selectedVersionId = detail.version_id;
      }
      state.selectedRuleProfileId = detail.rule_profile_id ?? null;
      if (detail.params_used) {
        Object.assign(state.params, detail.params_used);
        syncParamControls();
      }
      if (detail.rules_snapshot) {
        applyRuleSnapshot(detail.rules_snapshot);
        resetRuleBaseToValues();
        syncRuleControls();
      }
      state.planName = detail.name || defaultPlanName();
      state.planComment = detail.comment || '';
      state.lastPlanId = detail.id;
      const createdAt = detail.created_at ? new Date(detail.created_at) : new Date();
      state.generatedPlans = [
        {
          id: detail.id,
          status: detail.status,
          score: detail.score,
          objective_value: detail.objective_value,
          slots: detail.slots || [],
          name: state.planName,
          comment: state.planComment,
          versionId: detail.version_id,
          createdAt,
          ruleKeysActive: detail.rule_keys_active || [],
          rulesSnapshot: detail.rules_snapshot || {},
          paramsUsed: detail.params_used || { ...state.params },
        },
      ];
      if (detail.slots?.length) {
        state.visibleClasses = new Set(detail.slots.map(slot => slot.class_id));
      }
      renderRuleProfiles();
      renderVersionOptions();
      renderResults();
      updateRulesSummary();
      statusBar.set('Plan geladen.');
      setTimeout(statusBar.clear, 1500);
    } catch (err) {
      statusBar.set(`Plan konnte nicht geladen werden: ${formatError(err)}`, true);
    }
  }

  function renderVersionOptions() {
    versionSelect.innerHTML = '';
    if (!state.versions.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Keine Versionen vorhanden';
      versionSelect.appendChild(opt);
      versionSelect.disabled = true;
      return;
    }
    state.versions.forEach(version => {
      const opt = document.createElement('option');
      opt.value = String(version.id);
      opt.textContent = version.name || `Version #${version.id}`;
      if (state.selectedVersionId === version.id) opt.selected = true;
      versionSelect.appendChild(opt);
    });
    versionSelect.disabled = false;
    if (!state.selectedVersionId && state.versions.length) {
      state.selectedVersionId = state.versions[0].id;
    }
    loadAnalysis().then(renderAnalysis).catch(() => {});
    syncParamControls();
    updateRulesSummary();
  }

  function renderRuleProfiles() {
    ruleProfileSelect.innerHTML = '';
    const baseOption = document.createElement('option');
    baseOption.value = '';
    baseOption.textContent = 'Standard-Einstellungen';
    ruleProfileSelect.appendChild(baseOption);
    state.ruleProfiles.forEach(profile => {
      const opt = document.createElement('option');
      opt.value = String(profile.id);
      opt.textContent = profile.name || `Profil #${profile.id}`;
      if (state.selectedRuleProfileId === profile.id) opt.selected = true;
      ruleProfileSelect.appendChild(opt);
    });
    updateRulesSummary();
  }

  function initializeRuleValues() {
    state.ruleBaseBools = new Map();
    state.ruleBaseWeights = new Map();
    state.ruleValuesBools = new Map();
    state.ruleValuesWeights = new Map();
    state.ruleBackendDefaultsBools = new Map();
    state.ruleBackendDefaultsWeights = new Map();
    if (!state.rulesDefinition) return;
    state.rulesDefinition.bools.forEach(rule => {
      const defaultValue = !!rule.default;
      state.ruleBaseBools.set(rule.key, defaultValue);
      state.ruleValuesBools.set(rule.key, defaultValue);
      state.ruleBackendDefaultsBools.set(rule.key, defaultValue);
    });
    state.rulesDefinition.weights.forEach(rule => {
      const defaultValue = Number(rule.default ?? 0);
      state.ruleBaseWeights.set(rule.key, defaultValue);
      state.ruleValuesWeights.set(rule.key, defaultValue);
      state.ruleBackendDefaultsWeights.set(rule.key, defaultValue);
    });
  }

  function loadPersistedRuleDefaults() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const raw = window.localStorage.getItem(RULE_DEFAULTS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (parsed.bools && typeof parsed.bools === 'object') {
          Object.entries(parsed.bools).forEach(([key, value]) => {
            if (!state.ruleDefinitionByKey.has(key)) return;
            const boolVal = value === true || value === 'true' || value === 1 || value === '1';
            state.ruleBaseBools.set(key, boolVal);
            state.ruleValuesBools.set(key, boolVal);
          });
        }
        if (parsed.weights && typeof parsed.weights === 'object') {
          Object.entries(parsed.weights).forEach(([key, value]) => {
            if (!state.ruleDefinitionByKey.has(key)) return;
            const numeric = Number(value);
            if (Number.isNaN(numeric)) return;
            state.ruleBaseWeights.set(key, numeric);
            state.ruleValuesWeights.set(key, numeric);
          });
        }
      }
    } catch (err) {
      console.warn('Regel-Defaults konnten nicht geladen werden:', err);
    }
  }

  function persistRuleDefaults() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const payload = {
      bools: Object.fromEntries(state.ruleValuesBools),
      weights: Object.fromEntries(state.ruleValuesWeights),
    };
    try {
      window.localStorage.setItem(RULE_DEFAULTS_STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn('Regel-Defaults konnten nicht gespeichert werden:', err);
    }
    state.ruleBaseBools = new Map(state.ruleValuesBools);
    state.ruleBaseWeights = new Map(state.ruleValuesWeights);
  }

  function applyRuleSnapshot(snapshot = {}) {
    if (!state.rulesDefinition) return;
    state.rulesDefinition.bools.forEach(rule => {
      const value = snapshot.hasOwnProperty(rule.key)
        ? !!snapshot[rule.key]
        : !!rule.default;
      state.ruleValuesBools.set(rule.key, value);
    });
    state.rulesDefinition.weights.forEach(rule => {
      let value = snapshot.hasOwnProperty(rule.key)
        ? Number(snapshot[rule.key])
        : Number(rule.default);
      if (!Number.isFinite(value)) value = Number(rule.default ?? 0);
      state.ruleValuesWeights.set(rule.key, value);
    });
  }

  function resetRuleBaseToValues() {
    state.ruleBaseBools = new Map(state.ruleValuesBools);
    state.ruleBaseWeights = new Map(state.ruleValuesWeights);
  }

  function applyRuleProfile() {
    initializeRuleValues();
    if (!state.selectedRuleProfileId) {
      loadPersistedRuleDefaults();
    } else {
      const profile = state.ruleProfiles.find(p => p.id === state.selectedRuleProfileId);
      if (profile && state.rulesDefinition) {
        state.rulesDefinition.bools.forEach(rule => {
          if (profile[rule.key] !== undefined) {
            const value = !!profile[rule.key];
            state.ruleBaseBools.set(rule.key, value);
            state.ruleValuesBools.set(rule.key, value);
            state.ruleBackendDefaultsBools.set(rule.key, value);
          }
        });
        const hasBandToggle = state.rulesDefinition.bools.some(rule => rule.key === 'bandstunden_parallel');
        if (hasBandToggle && profile.leseband_parallel !== undefined && !state.ruleValuesBools.has('bandstunden_parallel')) {
          const value = !!profile.leseband_parallel;
          state.ruleBaseBools.set('bandstunden_parallel', value);
          state.ruleValuesBools.set('bandstunden_parallel', value);
          state.ruleBackendDefaultsBools.set('bandstunden_parallel', value);
        }
        state.rulesDefinition.weights.forEach(rule => {
          if (profile[rule.key] !== undefined) {
            const value = Number(profile[rule.key]);
            state.ruleBaseWeights.set(rule.key, value);
            state.ruleValuesWeights.set(rule.key, value);
            state.ruleBackendDefaultsWeights.set(rule.key, value);
          }
        });
      }
    }
    updateRulesSummary();
  }

  function renderRules() {
    state.boolInputs.clear();
    state.weightInputs.clear();
    state.ruleExtraContainers.clear();
    state.ruleGroupSections = new Map();
    if (!state.rulesDefinition) {
      rulesContainer.innerHTML = '<p class="text-sm opacity-70">Keine Regeln geladen.</p>';
      return;
    }

    rulesContainer.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'grid gap-6 lg:grid-cols-2';

    RULE_GROUPS.forEach(group => {
      const availableKeys = group.keys.filter(key => state.ruleDefinitionByKey.has(key));
      if (!availableKeys.length) return;

      const list = document.createElement('div');
      list.className = 'space-y-3';
      availableKeys.forEach(key => {
        const entry = createRuleEntry(key);
        if (entry) list.appendChild(entry);
      });
      if (!list.childElementCount) return;

      const card = document.createElement('article');
      card.className = 'border border-base-200 rounded-xl bg-base-100 shadow-sm overflow-hidden';

      const headerButton = document.createElement('button');
      headerButton.type = 'button';
      headerButton.className = 'flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-base-200/60 focus:outline-none';

      const headerContent = document.createElement('div');
      headerContent.className = 'space-y-1';
      const heading = document.createElement('h3');
      heading.className = 'text-sm font-semibold uppercase tracking-wide';
      heading.textContent = group.label;
      headerContent.appendChild(heading);
      if (group.description) {
        const desc = document.createElement('p');
        desc.className = 'text-xs opacity-70';
        desc.textContent = group.description;
        headerContent.appendChild(desc);
      }

      const chevron = document.createElement('span');
      chevron.className = 'text-lg transition-transform duration-200';
      chevron.textContent = '▾';

      headerButton.append(headerContent, chevron);
      card.appendChild(headerButton);

      const content = document.createElement('div');
      content.className = 'px-4 pb-4 space-y-4 border-t border-base-200';
      content.appendChild(list);
      card.appendChild(content);

      const entryRecord = {
        button: headerButton,
        content,
        chevron,
        collapsed: false,
      };
      state.ruleGroupSections.set(group.id, entryRecord);

      headerButton.addEventListener('click', () => {
        toggleRuleGroupCollapse(group.id);
      });

      const initialCollapsed = state.ruleGroupCollapsed.get(group.id) ?? false;
      setRuleGroupCollapsed(group.id, initialCollapsed, { suppressStore: true });

      grid.appendChild(card);
    });

    if (!grid.childElementCount) {
      const note = document.createElement('p');
      note.className = 'text-sm opacity-70';
      note.textContent = 'Keine Regeln verfügbar.';
      rulesContainer.appendChild(note);
    } else {
      rulesContainer.appendChild(grid);
    }

    syncRuleControls();
    loadAnalysis().then(renderAnalysis).catch(() => {});
  }

  function setRuleGroupCollapsed(groupId, collapsed, options = {}) {
    const entry = state.ruleGroupSections.get(groupId);
    if (!entry) return;
    const { suppressStore = false } = options;
    entry.collapsed = collapsed;
    entry.content.classList.toggle('hidden', collapsed);
    entry.button.setAttribute('aria-expanded', String(!collapsed));
    entry.chevron.style.transform = collapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
    if (!suppressStore || !state.ruleGroupCollapsed.has(groupId)) {
      state.ruleGroupCollapsed.set(groupId, collapsed);
    }
  }

  function toggleRuleGroupCollapse(groupId) {
    const entry = state.ruleGroupSections.get(groupId);
    if (!entry) return;
    setRuleGroupCollapsed(groupId, !entry.collapsed);
  }

  function collapseAllRuleGroups() {
    state.ruleGroupSections.forEach((_, groupId) => {
      setRuleGroupCollapsed(groupId, true);
    });
  }

  function createRuleEntry(ruleKey) {
    const ruleDef = state.ruleDefinitionByKey.get(ruleKey);
    if (!ruleDef) return null;

    const wrapper = document.createElement('div');
    wrapper.className = 'space-y-2 rounded-lg border border-base-200 bg-base-100/70 p-3';

    const header = document.createElement('div');
    header.className = 'flex items-start justify-between gap-3';

    const textWrap = document.createElement('div');
    textWrap.className = 'space-y-1';
    const title = document.createElement('span');
    title.className = 'font-medium text-sm';
    title.textContent = ruleDef.label || ruleKey;
    textWrap.appendChild(title);
    if (ruleDef.info) {
      const desc = document.createElement('p');
      desc.className = 'text-xs opacity-70';
      desc.textContent = ruleDef.info;
      textWrap.appendChild(desc);
    }

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'toggle toggle-primary';
    toggle.dataset.ruleKey = ruleKey;
    toggle.addEventListener('change', () => {
      state.ruleValuesBools.set(ruleKey, toggle.checked);
      updateExtraContainerState(ruleKey, toggle.checked);
      updateRulesSummary();
      markDebugStale();
    });

    header.append(textWrap, toggle);
    wrapper.appendChild(header);
    state.boolInputs.set(ruleKey, toggle);

    const extraKeys = RULE_EXTRAS[ruleKey] || [];
    if (extraKeys.length) {
      const extras = document.createElement('div');
      extras.className = 'space-y-3 border-l border-base-200 pl-4';
      extraKeys.forEach(weightKey => {
        const control = createInlineWeightControl(weightKey);
        if (control) extras.appendChild(control);
      });
      if (extras.childElementCount) {
        wrapper.appendChild(extras);
        state.ruleExtraContainers.set(ruleKey, extras);
      }
    }

    return wrapper;
  }

  function createInlineWeightControl(weightKey) {
    const weightDef = state.ruleDefinitionByKey.get(weightKey);
    if (!weightDef) return null;

    const block = document.createElement('div');
    block.className = 'space-y-1';

    const labelRow = document.createElement('div');
    labelRow.className = 'flex items-center justify-between text-xs font-medium';
    const labelText = document.createElement('span');
    labelText.textContent = weightDef.label || weightKey;
    const valueLabel = document.createElement('span');
    valueLabel.className = 'text-xs opacity-70';
    labelRow.append(labelText, valueLabel);
    block.appendChild(labelRow);

    if (weightDef.info) {
      const info = document.createElement('p');
      info.className = 'text-xs opacity-60';
      info.textContent = weightDef.info;
      block.appendChild(info);
    }

    const controls = document.createElement('div');
    controls.className = 'flex items-center gap-2';

    const min = weightDef.min ?? 0;
    const max = weightDef.max ?? 50;

    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'range range-primary range-xs flex-1';
    range.min = String(min);
    range.max = String(max);
    range.step = 1;

    const number = document.createElement('input');
    number.type = 'number';
    number.className = 'input input-xs input-bordered w-20';
    number.min = String(min);
    number.max = String(max);
    number.step = '1';

    controls.append(range, number);
    block.appendChild(controls);

    state.weightInputs.set(weightKey, { range, number, valueLabel });

    const applyValue = value => {
      state.ruleValuesWeights.set(weightKey, value);
      range.value = String(value);
      number.value = String(value);
      valueLabel.textContent = String(value);
      updateRulesSummary();
      markDebugStale();
    };

    range.addEventListener('input', () => {
      const value = Number(range.value);
      applyValue(value);
    });

    number.addEventListener('change', () => {
      let value = Number(number.value);
      if (Number.isNaN(value)) value = state.ruleValuesWeights.get(weightKey) ?? weightDef.default ?? min;
      value = Math.max(min, Math.min(max, value));
      applyValue(value);
    });

    return block;
  }

  function updateExtraContainerState(ruleKey, enabled) {
    const container = state.ruleExtraContainers.get(ruleKey);
    if (!container) return;
    if (enabled) {
      container.classList.remove('opacity-40', 'pointer-events-none');
    } else {
      container.classList.add('opacity-40', 'pointer-events-none');
    }
  }

  function syncRuleControls() {
    if (!state.rulesDefinition) return;
    state.rulesDefinition.bools.forEach(rule => {
      const value = state.ruleValuesBools.get(rule.key);
      const input = state.boolInputs.get(rule.key);
      if (input) {
        input.checked = !!value;
        updateExtraContainerState(rule.key, !!value);
      }
    });
    state.rulesDefinition.weights.forEach(rule => {
      const value = state.ruleValuesWeights.get(rule.key);
      const entry = state.weightInputs.get(rule.key);
      if (entry) {
        const resolved = value ?? rule.default ?? 0;
        entry.range.value = String(resolved);
        entry.number.value = String(resolved);
        if (entry.valueLabel) entry.valueLabel.textContent = String(resolved);
      }
    });
    syncParamControls();
  }

  function renderSolverControls() {
    if (!solverContainer) return;
    solverContainer.innerHTML = '';
    state.paramInputs = new Map();

    const intro = document.createElement('p');
    intro.className = 'text-sm opacity-70';
    intro.textContent = 'Feintuning der OR-Tools-Suche – wirkt sich auf Laufzeit und Ergebnisqualität aus.';
    solverContainer.appendChild(intro);

    const grid = document.createElement('div');
    grid.className = 'grid gap-4 lg:grid-cols-2';

    const columnA = document.createElement('div');
    columnA.className = 'space-y-3';
    columnA.append(
      createParamRowCheckbox('Mehrfach-Start', 'Mehrere Startläufe mit unterschiedlichen Seeds', 'multi_start'),
      createParamRowNumber('Max. Versuche', 'Anzahl Startläufe (nur bei Mehrfach-Start)', 'max_attempts', { min: 1, max: 200, step: 1 }),
      createParamRowNumber('Geduld', 'Abbruch nach so vielen erfolglosen Läufen', 'patience', { min: 1, max: 50, step: 1 }),
      createParamRowNumber('Zeit pro Versuch (s)', 'Maximale Solver-Zeit pro Versuch', 'time_per_attempt', { min: 1, max: 600, step: 0.5 }),
    );

    const columnB = document.createElement('div');
    columnB.className = 'space-y-3';
    columnB.append(
      createParamRowCheckbox('Zufallssuche', 'Zufallsheuristiken aktivieren', 'randomize_search'),
      createParamRowNumber('Basis-Seed', 'Startwert für Zufallszahlen', 'base_seed', { step: 1 }),
      createParamRowNumber('Seed-Schritt', 'Offset für weitere Versuche', 'seed_step', { step: 1 }),
      createParamRowCheckbox('Value Hints', 'Startwerte für Slots vorgeben', 'use_value_hints'),
    );

    grid.append(columnA, columnB);
    solverContainer.appendChild(grid);
    syncParamControls();
  }

  function syncParamControls() {
    state.paramInputs.forEach((entry, key) => {
      const value = state.params[key];
      if (!entry || value === undefined) return;
      if (entry.type === 'checkbox') {
        entry.element.checked = !!value;
      } else if (entry.type === 'number') {
        entry.element.value = `${value}`;
      }
    });
  }

  async function handleGenerate() {
    state.generating = true;
    generateButton.disabled = true;
    saveButton.disabled = true;
    progressModal.showLoading();
    try {
      state.planName = defaultPlanName();
      state.planComment = '';
      const overrides = buildOverrides();
      const payload = {
        name: state.planName,
        comment: state.planComment || null,
        version_id: state.selectedVersionId,
        rule_profile_id: state.selectedRuleProfileId,
        override_rules: Object.keys(overrides).length ? overrides : null,
        params: { ...state.params },
      };
      const response = await generatePlan(payload);
      const planEntry = {
        id: response.plan_id,
        status: response.status,
        score: response.score,
        objective_value: response.objective_value,
        slots: response.slots || [],
        name: state.planName,
        comment: state.planComment,
        versionId: state.selectedVersionId,
        createdAt: new Date(),
        ruleKeysActive: response.rule_keys_active || [],
        rulesSnapshot: response.rules_snapshot || {},
        paramsUsed: response.params_used || { ...state.params },
      };
      state.generatedPlans.unshift(planEntry);
      state.generatedPlans = state.generatedPlans.slice(0, 5);
      state.lastPlanId = planEntry.id;
      saveButton.disabled = false;
      if (planEntry.slots.length) {
        state.visibleClasses = new Set(planEntry.slots.map(slot => slot.class_id));
      }
      renderResults();
      persistRuleDefaults();
      updateRulesSummary();
      await loadAnalysis();
      if (state.activeTab === 'analysis') {
        renderAnalysis();
      }
      collapseAllRuleGroups();
      statusBar.clear();
      progressModal.showSuccess({
        title: 'Fertig!',
        message: 'Der Solver hat einen neuen Stundenplan erzeugt. Viel Spaß beim Prüfen der Ergebnisse.',
      });
    } catch (err) {
      progressModal.close();
      saveButton.disabled = !state.lastPlanId;
      statusBar.set(`Planberechnung fehlgeschlagen: ${formatError(err)}`, true);
    } finally {
      state.generating = false;
      generateButton.disabled = false;
      if (!progressModal.isOpen()) {
        saveButton.disabled = !state.lastPlanId;
      }
    }
  }

  async function handleSave(name, comment) {
    try {
      await updatePlan(state.lastPlanId, { name, comment });
      state.planName = name;
      state.planComment = comment;
      state.generatedPlans = state.generatedPlans.map(entry =>
        entry.id === state.lastPlanId ? { ...entry, name, comment } : entry
      );
      renderResults();
      statusBar.set('Plan gespeichert.');
      setTimeout(statusBar.clear, 1500);
    } catch (err) {
      statusBar.set(`Speichern fehlgeschlagen: ${formatError(err)}`, true);
    }
  }

  async function runRuleDiagnostics() {
    if (!state.selectedVersionId) {
      statusBar.set('Bitte wähle zuerst eine Stundenverteilung für den Debug-Lauf aus.', true);
      return;
    }
    if (state.debugRunning) return;

    state.debugRunning = true;
    state.debugStale = false;
    debugButton.disabled = true;
    debugStatus.textContent = 'Starte Debug-Läufe…';

    const runs = [];
    renderDebugResults([]);

    const ruleSnapshot = collectRuleSnapshot();
    const boolDefs = state.rulesDefinition?.bools || [];

    const baseline = await executeDryRun(
      'baseline',
      'Aktuelle Regeln',
      ruleSnapshot,
      'Aktuelle Einstellungen'
    );
    runs.push(baseline);

    for (const rule of boolDefs) {
      const currentValue = !!ruleSnapshot[rule.key];
      if (!currentValue) continue;
      const toggledRules = { ...ruleSnapshot, [rule.key]: false };
      const label = `${rule.label || rule.key} deaktiviert`;
      const result = await executeDryRun(
        rule.key,
        label,
        toggledRules,
        `${rule.label || rule.key} deaktiviert`
      );
      runs.push(result);
    }

    state.debugRuns = runs;
    renderDebugResults(runs);

    const failures = runs.filter(run => !run.success).length;
    if (failures) {
      debugStatus.textContent = `${runs.length} Debug-Läufe abgeschlossen – ${failures} ohne Lösung.`;
    } else {
      debugStatus.textContent = `${runs.length} Debug-Läufe abgeschlossen.`;
    }

    debugButton.disabled = false;
    state.debugRunning = false;
  }

  async function executeDryRun(key, label, ruleValues, changeSummary) {
    const payload = {
      name: `${state.planName || 'Plan'} • Debug`,
      comment: null,
      version_id: state.selectedVersionId,
      rule_profile_id: state.selectedRuleProfileId,
      override_rules: { ...ruleValues },
      params: { ...state.params },
      dry_run: true,
    };
    const start = performance.now();
    try {
      const response = await generatePlan(payload);
      const duration = performance.now() - start;
      return {
        key,
        label,
        change: changeSummary,
        success: true,
        status: response.status,
        score: response.score,
        duration,
      };
    } catch (err) {
      const duration = performance.now() - start;
      return {
        key,
        label,
        change: changeSummary,
        success: false,
        status: 'FAILED',
        score: null,
        duration,
        error: formatError(err),
      };
    }
  }

  function collectRuleSnapshot() {
    const snapshot = {};
    if (!state.rulesDefinition) return snapshot;
    state.rulesDefinition.bools.forEach(rule => {
      const current = state.ruleValuesBools.get(rule.key);
      snapshot[rule.key] = current !== undefined ? !!current : !!rule.default;
    });
    state.rulesDefinition.weights.forEach(rule => {
      const current = state.ruleValuesWeights.get(rule.key);
      snapshot[rule.key] = current !== undefined ? Number(current) : Number(rule.default ?? 0);
    });
    return snapshot;
  }

  function renderDebugResults(runs = state.debugRuns) {
    debugResults.innerHTML = '';
    if (!runs || !runs.length) {
      const note = document.createElement('p');
      note.className = 'text-sm opacity-60';
      note.textContent = state.debugRunning ? 'Debug-Läufe laufen…' : 'Noch keine Debug-Läufe durchgeführt.';
      debugResults.appendChild(note);
      return;
    }

    const table = document.createElement('table');
    table.className = 'table table-sm';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['Szenario', 'Status', 'Score', 'Dauer', 'Änderung', 'Hinweis'].forEach(title => {
      const th = document.createElement('th');
      th.textContent = title;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    runs.forEach(run => {
      const tr = document.createElement('tr');

      const tdScenario = document.createElement('td');
      tdScenario.textContent = run.label;
      tr.appendChild(tdScenario);

      const tdStatus = document.createElement('td');
      tdStatus.textContent = run.status;
      tdStatus.className = run.success ? 'text-success' : 'text-error';
      tr.appendChild(tdStatus);

      const tdScore = document.createElement('td');
      tdScore.textContent = run.score != null ? run.score.toFixed(2) : '—';
      tr.appendChild(tdScore);

      const tdDuration = document.createElement('td');
      tdDuration.textContent = formatDuration(run.duration);
      tr.appendChild(tdDuration);

      const tdChange = document.createElement('td');
      tdChange.textContent = run.change || '—';
      tr.appendChild(tdChange);

      const tdHint = document.createElement('td');
      tdHint.textContent = run.error || (run.success ? 'OK' : 'Fehler');
      if (!run.success && !run.error) {
        tdHint.textContent = 'Keine Lösung';
      }
      tr.appendChild(tdHint);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    debugResults.appendChild(table);
  }

  function markDebugStale() {
    if (state.debugRunning) return;
    state.debugStale = true;
    if (state.debugRuns.length) {
      debugStatus.textContent = 'Einstellungen geändert – Debug erneut starten.';
    } else {
      debugStatus.textContent = 'Noch kein Debug-Lauf gestartet.';
    }
  }

  function formatDuration(ms) {
    if (!Number.isFinite(ms)) return '—';
    if (ms < 1000) return `${Math.round(ms)} ms`;
    const seconds = ms / 1000;
    if (seconds < 10) return `${seconds.toFixed(2)} s`;
    if (seconds < 60) return `${seconds.toFixed(1)} s`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes} min ${rest.toFixed(1)} s`;
  }

  function buildOverrides() {
    const overrides = {};
    state.ruleValuesBools.forEach((value, key) => {
      const baseline = state.ruleBackendDefaultsBools.get(key);
      if (baseline === undefined || baseline !== value) {
        overrides[key] = value;
      }
    });
    state.ruleValuesWeights.forEach((value, key) => {
      const baseline = state.ruleBackendDefaultsWeights.get(key);
      if (baseline === undefined || baseline !== value) {
        overrides[key] = value;
      }
    });
    return overrides;
  }

  function updateRulesSummary() {
    const profile = state.ruleProfiles.find(p => p.id === state.selectedRuleProfileId);
    rulesProfileBadge.textContent = `Profil: ${profile?.name || 'Standard'}`;
    const overrides = buildOverrides();
    const ruleCount = overrides ? Object.keys(overrides).length : 0;
    const paramCount = Object.keys(DEFAULT_PARAMS).reduce((acc, key) => {
      return acc + (DEFAULT_PARAMS[key] === state.params[key] ? 0 : 1);
    }, 0);
    rulesOverridesBadge.textContent = `Overrides: ${ruleCount} • Params: ${paramCount}`;
  }

  function renderResults() {
    resultsSection.innerHTML = '';
    renderEditingSection();
    if (editingSection.parentElement !== resultsSection) {
      resultsSection.appendChild(editingSection);
    } else if (!state.editing) {
      editingSection.classList.add('hidden');
    }

    if (!state.generatedPlans.length) {
      const empty = document.createElement('div');
      empty.className = 'alert alert-info';
      empty.textContent = 'Noch kein Plan berechnet.';
      resultsSection.appendChild(empty);
      return;
    }

    if (!state.visibleClasses || !state.visibleClasses.size) {
      state.visibleClasses = new Set(Array.from(state.classes.keys()));
    }

    const actionsRow = document.createElement('div');
    actionsRow.className = 'flex flex-wrap items-center justify-between gap-3';
    const saveInfo = document.createElement('p');
    saveInfo.className = 'text-sm opacity-70';
    saveInfo.textContent = 'Gefällt der Plan? Speichere ihn als Variante.';
    saveButton.disabled = !state.lastPlanId;
    actionsRow.append(saveInfo, saveButton);
    resultsSection.appendChild(actionsRow);

    const filterBar = createClassFilterBar();
    if (filterBar) {
      resultsSection.appendChild(filterBar);
    }

    if (!state.editing) {
      resultsSection.appendChild(renderTeacherHighlightControls());
    }

    state.generatedPlans.forEach(entry => {
      const card = document.createElement('article');
      card.className = 'card bg-base-100 border border-base-200 shadow-sm';
      const body = document.createElement('div');
      body.className = 'card-body space-y-4';

      const headerRow = document.createElement('div');
      headerRow.className = 'flex flex-wrap items-start justify-between gap-3';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'space-y-1';
      const title = document.createElement('h3');
      title.className = 'card-title';
      title.textContent = entry.name || `Plan #${entry.id}`;
      const meta = document.createElement('p');
      meta.className = 'text-xs opacity-70';
      const versionName = state.versions.find(v => v.id === entry.versionId)?.name || `Version #${entry.versionId ?? '—'}`;
      const commentText = entry.comment ? ` • ${entry.comment}` : '';
      meta.textContent = `${versionName}${commentText} • ID ${entry.id}`;
      titleWrap.append(title, meta);

      const badges = document.createElement('div');
      badges.className = 'flex flex-wrap items-center gap-2';
      if (entry.score != null) {
        const scoreBadge = document.createElement('span');
        scoreBadge.className = 'badge badge-success badge-outline';
        scoreBadge.textContent = `Score: ${entry.score.toFixed(2)}`;
        badges.appendChild(scoreBadge);
      }
      const statusBadge = document.createElement('span');
      statusBadge.className = 'badge badge-outline';
      statusBadge.textContent = entry.status;
      badges.appendChild(statusBadge);

      headerRow.append(titleWrap, badges);
      body.appendChild(headerRow);

      const cardActions = document.createElement('div');
      cardActions.className = 'flex flex-wrap items-center gap-2';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      if (state.editing && state.editing.planId === entry.id) {
        editBtn.className = 'btn btn-xs btn-secondary';
        editBtn.textContent = 'Bearbeitung aktiv';
        editBtn.disabled = true;
      } else if (entry.id) {
        editBtn.className = 'btn btn-xs btn-outline';
        editBtn.textContent = 'Bearbeiten';
        editBtn.addEventListener('click', () => startEditingPlan(entry));
      } else {
        editBtn.className = 'btn btn-xs btn-outline';
        editBtn.textContent = 'Bearbeiten';
        editBtn.disabled = true;
        editBtn.title = 'Bitte zuerst speichern';
      }
      cardActions.appendChild(editBtn);

      const printBtn = document.createElement('button');
      printBtn.type = 'button';
      printBtn.className = 'btn btn-xs btn-outline';
      printBtn.textContent = 'Drucken';
      if (!entry.slots || !entry.slots.length) {
        printBtn.disabled = true;
        printBtn.title = 'Keine Slots vorhanden';
      } else {
        printBtn.addEventListener('click', () => {
          openPlanPrintModal({
            plan: entry,
            classes: state.classes,
            teachers: state.teachers,
            subjects: state.subjects,
          });
        });
      }
      cardActions.appendChild(printBtn);

      body.appendChild(cardActions);

      const activeRulesBlock = renderActiveRuleBadges(entry);
      if (activeRulesBlock) {
        body.appendChild(activeRulesBlock);
      }

      body.appendChild(createPlanGrid({
        slots: entry.slots,
        classes: state.classes,
        subjects: state.subjects,
        teachers: state.teachers,
        visibleClasses: state.visibleClasses,
        highlightedTeacherId: state.highlightedTeacherId,
      }));

      card.appendChild(body);
      resultsSection.appendChild(card);
    });
  }

  function startEditingPlan(planEntry) {
    if (!planEntry?.id) {
      statusBar.set('Plan kann erst nach dem Speichern bearbeitet werden.', true);
      return;
    }
    state.editing = {
      planId: planEntry.id,
      planName: planEntry.name || `Plan #${planEntry.id}`,
      slotsOriginal: cloneSlotsArray(planEntry.slots || []),
      slotsMap: buildSlotsMapFromArray(planEntry.slots || []),
      parking: [],
      dirty: false,
    };
    state.editingParkingSeq = 0;
    state.dragPayload = null;
    renderResults();
  }

  function cancelEditingPlan() {
    state.editing = null;
    state.dragPayload = null;
    renderResults();
  }

  function resetEditingPlan() {
    if (!state.editing) return;
    state.editing.slotsMap = buildSlotsMapFromArray(state.editing.slotsOriginal);
    state.editing.parking = [];
    state.editing.dirty = false;
    state.dragPayload = null;
    renderResults();
  }

  function setEditingDirty(value = true) {
    if (state.editing) {
      state.editing.dirty = value;
    }
  }

  function toggleHighlightedTeacher(teacherId) {
    const numericId = teacherId == null ? null : Number(teacherId);
    state.highlightedTeacherId = state.highlightedTeacherId === numericId ? null : numericId;
    renderResults();
  }

  function isTeacherHighlighted(teacherId) {
    if (state.highlightedTeacherId == null) return false;
    if (teacherId == null) return false;
    return Number(teacherId) === Number(state.highlightedTeacherId);
  }

  function buildSlotsMapFromArray(slots = []) {
    const map = new Map();
    slots.forEach(slot => {
      const key = getSlotKey(slot.class_id, slot.tag, slot.stunde);
      map.set(key, cloneSlot(slot));
    });
    return map;
  }

  function cloneSlotsArray(slots = []) {
    return slots.map(cloneSlot);
  }

  function cloneSlot(slot) {
    return {
      class_id: slot.class_id,
      tag: slot.tag,
      stunde: slot.stunde,
      subject_id: slot.subject_id,
      teacher_id: slot.teacher_id,
    };
  }

  function getSlotKey(classId, tag, stunde) {
    return `${tag}|${stunde}|${classId}`;
  }

  function getCanonicalSubjectId(subjectId) {
    const subject = state.subjects.get(subjectId);
    return subject?.alias_subject_id || subjectId;
  }

  function isBandSubject(subjectId) {
    const subject = state.subjects.get(subjectId);
    return Boolean(subject?.is_bandfach);
  }

  function renderEditingSection() {
    editingSection.innerHTML = '';
    if (!state.editing) {
      editingSection.classList.add('hidden');
      return;
    }
    editingSection.classList.remove('hidden');

    const header = document.createElement('div');
    header.className = 'flex flex-wrap items-center justify-between gap-3';
    const title = document.createElement('h2');
    title.className = 'text-lg font-semibold';
    title.textContent = `Plan bearbeiten: ${state.editing.planName}`;

    const controls = document.createElement('div');
    controls.className = 'flex flex-wrap items-center gap-2';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-primary btn-sm';
    saveBtn.textContent = 'Änderungen speichern';
    saveBtn.disabled = state.editing.parking.length > 0 || !state.editing.dirty;
    saveBtn.addEventListener('click', handleSaveEditing);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn btn-outline btn-sm';
    resetBtn.textContent = 'Auf Ursprung zurücksetzen';
    resetBtn.disabled = !state.editing.dirty && state.editing.parking.length === 0;
    resetBtn.addEventListener('click', resetEditingPlan);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-ghost btn-sm';
    cancelBtn.textContent = 'Bearbeitung beenden';
    cancelBtn.addEventListener('click', cancelEditingPlan);

    controls.append(saveBtn, resetBtn, cancelBtn);
    header.append(title, controls);
    editingSection.appendChild(header);

    const helper = document.createElement('p');
    helper.className = 'text-xs opacity-70';
    helper.textContent = 'Ziehen, um Slots zu verschieben. Lehrkräfte dürfen nicht doppelt belegt werden (außer bei Bandfächern).';
    editingSection.appendChild(helper);

    editingSection.appendChild(renderTeacherHighlightControls());

    const layout = document.createElement('div');
    layout.className = 'grid gap-6 xl:grid-cols-[minmax(720px,1fr)_300px]';
    layout.appendChild(renderEditingGrid());
    layout.appendChild(renderEditingPalette());
    editingSection.appendChild(layout);
  }

  function renderTeacherHighlightControls() {
    const wrap = document.createElement('div');
    wrap.className = 'flex flex-wrap items-center gap-2 text-xs';

    const label = document.createElement('span');
    label.className = 'font-semibold uppercase tracking-wide';
    label.textContent = 'Lehrkraft hervorheben:';
    wrap.appendChild(label);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = `btn btn-xs ${state.highlightedTeacherId == null ? 'btn-active btn-outline' : 'btn-outline'}`;
    clearBtn.textContent = 'Alle';
    clearBtn.addEventListener('click', () => toggleHighlightedTeacher(null));
    wrap.appendChild(clearBtn);

    const teacherEntries = Array.from(state.teachers.entries()).sort(([, a], [, b]) => {
      const nameA = (a.kuerzel || a.name || '').toLowerCase();
      const nameB = (b.kuerzel || b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    teacherEntries.forEach(([id, teacher]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isActive = isTeacherHighlighted(id);
      btn.className = `btn btn-xs ${isActive ? 'btn-primary' : 'btn-outline'}`;
      btn.textContent = teacher.kuerzel || teacher.name || `#${id}`;
      btn.addEventListener('click', () => toggleHighlightedTeacher(id));
      wrap.appendChild(btn);
    });

    return wrap;
  }

  function renderEditingGrid() {
    const card = document.createElement('article');
    card.className = 'card bg-base-100 border border-base-200 shadow-sm';
    const body = document.createElement('div');
    body.className = 'card-body space-y-4';

    const table = document.createElement('table');
    table.className = 'w-full border-collapse text-sm select-none';

    const thead = document.createElement('thead');
    const dayRow = document.createElement('tr');
    const timeHeader = document.createElement('th');
    timeHeader.rowSpan = 2;
    timeHeader.className = 'bg-base-200 text-left uppercase text-xs tracking-wide px-4 py-3 border border-base-300 min-w-[90px]';
    timeHeader.textContent = 'Zeit';
    dayRow.appendChild(timeHeader);

    const orderedClassIds = Array.from(state.classes.keys()).sort((a, b) => getClassName(state.classes, a).localeCompare(getClassName(state.classes, b)));

    DAYS.forEach(day => {
      const th = document.createElement('th');
      th.colSpan = orderedClassIds.length;
      th.className = 'bg-base-200 text-center text-sm font-semibold px-4 py-3 border border-base-300';
      th.textContent = DAY_LABELS[day] || day;
      dayRow.appendChild(th);
    });
    thead.appendChild(dayRow);

    const classRow = document.createElement('tr');
    DAYS.forEach((day, dayIdx) => {
      orderedClassIds.forEach(classId => {
        const th = document.createElement('th');
        const stripe = dayIdx % 2 === 0 ? 'bg-base-100' : 'bg-base-200/60';
        th.className = `${stripe} text-center text-xs font-medium px-3 py-2 border border-base-300`;
        th.textContent = getClassName(state.classes, classId);
        classRow.appendChild(th);
      });
    });
    thead.appendChild(classRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    STUNDEN.forEach(period => {
      const tr = document.createElement('tr');
      const periodCell = document.createElement('th');
      periodCell.className = 'bg-base-100 px-3 py-4 text-left text-xs font-semibold border border-base-300';
      periodCell.textContent = `${period}. Stunde`;
      tr.appendChild(periodCell);

      DAYS.forEach((day, dayIdx) => {
        orderedClassIds.forEach(classId => {
          const key = getSlotKey(classId, day, period - 1);
          const slot = state.editing.slotsMap.get(key) || null;
          const td = document.createElement('td');
          const stripe = dayIdx % 2 === 0 ? 'bg-base-100' : 'bg-base-200/40';
          td.className = `align-top p-1.5 border border-base-200 ${stripe} min-w-[150px]`;
          td.dataset.classId = String(classId);
          td.dataset.tag = day;
          td.dataset.stunde = String(period - 1);
          td.addEventListener('dragover', handleCellDragOver);
          td.addEventListener('dragleave', handleCellDragLeave);
          td.addEventListener('drop', handleCellDrop);

          td.appendChild(renderEditingSlot(slot, key));
          tr.appendChild(td);
        });
      });

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    body.appendChild(table);
    card.appendChild(body);
    return card;
  }

  function renderEditingSlot(slot, slotKey) {
    const wrapper = document.createElement('div');
    if (!slot) {
      wrapper.className = 'h-full min-h-[72px] rounded-lg border border-dashed border-base-300 bg-base-200/40 flex flex-col justify-center items-center text-[11px] text-base-content/60';
      wrapper.textContent = 'frei';
      return wrapper;
    }

    const subject = state.subjects.get(slot.subject_id);
    const teacher = state.teachers.get(slot.teacher_id);
    wrapper.className = 'h-full min-h-[72px] rounded-lg border border-base-300 bg-base-100 px-2.5 py-2 flex flex-col gap-1 shadow-sm cursor-grab active:cursor-grabbing';
    wrapper.draggable = true;
    wrapper.dataset.slotKey = slotKey;
    wrapper.addEventListener('dragstart', event => handleSlotDragStart(event, slot));
    wrapper.addEventListener('dragend', handleSlotDragEnd);

    if (subject?.color) {
      const bg = colorToRgba(subject.color, 0.25);
      const border = colorToRgba(subject.color, 0.6) || subject.color;
      if (bg) wrapper.style.backgroundColor = bg;
      if (border) wrapper.style.borderColor = border;
    }

    const subjectLine = document.createElement('div');
    subjectLine.className = 'font-semibold text-xs uppercase tracking-wide text-base-content';
    subjectLine.textContent = subject?.kuerzel || subject?.name || `Fach #${slot.subject_id}`;
    wrapper.appendChild(subjectLine);

    if (teacher) {
      const teacherLine = document.createElement('div');
      teacherLine.className = 'text-[11px] opacity-80';
      teacherLine.textContent = teacher.kuerzel || teacher.name || '';
      if (teacherLine.textContent) wrapper.appendChild(teacherLine);
    }

    if (isBandSubject(slot.subject_id)) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-xs badge-outline badge-primary';
      badge.textContent = 'Band';
      const meta = document.createElement('div');
      meta.className = 'flex items-center gap-1 mt-auto';
      meta.appendChild(badge);
      wrapper.appendChild(meta);
    }

    if (isTeacherHighlighted(slot.teacher_id)) {
      wrapper.classList.add('ring', 'ring-primary', 'ring-offset-2');
    }

    return wrapper;
  }

  function renderEditingPalette() {
    const card = document.createElement('article');
    card.className = 'card bg-base-100 border border-dashed border-base-300 shadow-sm h-full';
    const body = document.createElement('div');
    body.className = 'card-body space-y-3';

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between gap-2';
    const title = document.createElement('h3');
    title.className = 'text-sm font-semibold uppercase tracking-wide';
    title.textContent = 'Zwischenablage';
    header.appendChild(title);
    body.appendChild(header);

    const dropZone = document.createElement('div');
    dropZone.className = 'space-y-2 min-h-[80px] border border-dashed border-base-300 rounded-lg p-3 bg-base-200/30';
    dropZone.addEventListener('dragover', handlePaletteDragOver);
    dropZone.addEventListener('dragleave', handlePaletteDragLeave);
    dropZone.addEventListener('drop', handlePaletteDrop);

    if (!state.editing.parking.length) {
      const empty = document.createElement('p');
      empty.className = 'text-xs opacity-60 text-center';
      empty.textContent = 'Keine Fächer abgelegt.';
      dropZone.appendChild(empty);
    } else {
      state.editing.parking.forEach(item => {
        dropZone.appendChild(renderPaletteItem(item));
      });
    }

    body.appendChild(dropZone);
    card.appendChild(body);
    return card;
  }

  function renderPaletteItem(item) {
    const wrapper = document.createElement('div');
    wrapper.className = 'rounded-lg border border-base-300 bg-base-100 px-3 py-2 shadow-sm cursor-grab active:cursor-grabbing';
    wrapper.draggable = true;
    wrapper.dataset.paletteId = item.id;
    wrapper.addEventListener('dragstart', event => handlePaletteDragStart(event, item));
    wrapper.addEventListener('dragend', handleSlotDragEnd);

    const subject = state.subjects.get(item.subjectId);
    const teacher = state.teachers.get(item.teacherId);
    if (subject?.color) {
      const bg = colorToRgba(subject.color, 0.25);
      const border = colorToRgba(subject.color, 0.6) || subject.color;
      if (bg) wrapper.style.backgroundColor = bg;
      if (border) wrapper.style.borderColor = border;
    }

    const title = document.createElement('div');
    title.className = 'flex items-center justify-between gap-2';
    const label = document.createElement('span');
    label.className = 'font-semibold text-xs uppercase tracking-wide';
    label.textContent = subject?.kuerzel || subject?.name || `Fach #${item.subjectId}`;
    const badge = document.createElement('span');
    badge.className = 'badge badge-xs badge-outline';
    badge.textContent = item.type === 'band' ? 'Band' : 'Slot';
    title.append(label, badge);
    wrapper.appendChild(title);

    if (teacher) {
      const teacherLine = document.createElement('div');
      teacherLine.className = 'text-[11px] opacity-80';
      teacherLine.textContent = teacher.kuerzel || teacher.name || '';
      wrapper.appendChild(teacherLine);
    }

    const classesLine = document.createElement('div');
    classesLine.className = 'text-[10px] opacity-70';
    const classNames = item.slots.map(slot => getClassName(state.classes, slot.class_id)).join(', ');
    classesLine.textContent = `Klassen: ${classNames}`;
    wrapper.appendChild(classesLine);

    const actions = document.createElement('div');
    actions.className = 'flex justify-end mt-1';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-xs btn-ghost text-error';
    removeBtn.textContent = 'Entfernen';
    removeBtn.addEventListener('click', () => removePaletteItem(item.id));
    actions.appendChild(removeBtn);
    wrapper.appendChild(actions);

    if (isTeacherHighlighted(item.teacherId)) {
      wrapper.classList.add('ring', 'ring-primary', 'ring-offset-2');
    }
    return wrapper;
  }

  function removePaletteItem(id, options = {}) {
    if (!state.editing) return;
    state.editing.parking = state.editing.parking.filter(item => item.id !== id);
    setEditingDirty(true);
    if (!options.silent) {
      renderResults();
    }
  }

  function handleSlotDragStart(event, slot) {
    if (!state.editing) return;
    const payload = createDragPayloadFromGrid(slot);
    if (!payload) {
      event.preventDefault();
      return;
    }
    state.dragPayload = { source: 'grid', data: payload };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', 'slot');
  }

  function handleSlotDragEnd() {
    state.dragPayload = null;
  }

  function handleCellDragOver(event) {
    if (!state.dragPayload) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    event.currentTarget.classList.add('outline', 'outline-primary');
  }

  function handleCellDragLeave(event) {
    event.currentTarget.classList.remove('outline', 'outline-primary');
  }

  function handleCellDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('outline', 'outline-primary');
    if (!state.dragPayload) return;
    const classId = Number(event.currentTarget.dataset.classId);
    const tag = event.currentTarget.dataset.tag;
    const stunde = Number(event.currentTarget.dataset.stunde);
    if (applyDropToCell(classId, tag, stunde)) {
      state.dragPayload = null;
      renderResults();
    }
  }

  function handlePaletteDragOver(event) {
    if (!state.dragPayload) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    event.currentTarget.classList.add('outline', 'outline-primary');
  }

  function handlePaletteDragLeave(event) {
    event.currentTarget.classList.remove('outline', 'outline-primary');
  }

  function handlePaletteDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('outline', 'outline-primary');
    if (!state.dragPayload) return;
    if (moveSlotToPalette()) {
      state.dragPayload = null;
      renderResults();
    }
  }

  function handlePaletteDragStart(event, item) {
    state.dragPayload = { source: 'palette', data: cloneParkingItem(item) };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', 'palette-slot');
  }

  function cloneParkingItem(item) {
    return {
      id: item.id,
      type: item.type,
      subjectId: item.subjectId,
      teacherId: item.teacherId,
      canonicalSubjectId: item.canonicalSubjectId,
      slots: item.slots.map(cloneSlot),
      originKeys: new Set(),
    };
  }

  function createDragPayloadFromGrid(slot) {
    if (!state.editing) return null;
    const key = getSlotKey(slot.class_id, slot.tag, slot.stunde);
    const existing = state.editing.slotsMap.get(key);
    if (!existing) return null;
    if (isBandSubject(existing.subject_id)) {
      const canonicalId = getCanonicalSubjectId(existing.subject_id);
      const slots = [];
      state.editing.slotsMap.forEach(value => {
        if (!value) return;
        if (value.tag !== slot.tag || value.stunde !== slot.stunde) return;
        if (value.teacher_id !== existing.teacher_id) return;
        if (getCanonicalSubjectId(value.subject_id) !== canonicalId) return;
        slots.push(cloneSlot(value));
      });
      return {
        type: 'band',
        subjectId: existing.subject_id,
        teacherId: existing.teacher_id,
        canonicalSubjectId: canonicalId,
        slots,
        originKeys: new Set(slots.map(s => getSlotKey(s.class_id, s.tag, s.stunde))),
      };
    }
    return {
      type: 'single',
      subjectId: existing.subject_id,
      teacherId: existing.teacher_id,
      canonicalSubjectId: getCanonicalSubjectId(existing.subject_id),
      slots: [cloneSlot(existing)],
      originKeys: new Set([key]),
    };
  }

  function applyDropToCell(targetClassId, targetTag, targetStunde) {
    if (!state.editing || !state.dragPayload) return false;
    const payload = state.dragPayload.data;
    const fromPalette = state.dragPayload.source === 'palette';

    const targetKey = getSlotKey(targetClassId, targetTag, targetStunde);
    const occupant = state.editing.slotsMap.get(targetKey);
    if (occupant) {
      statusBar.set('Slot ist belegt. Bitte zuerst freimachen.', true);
      return false;
    }

    let slotsToPlace = [];
    if (payload.type === 'single') {
      const baseSlot = payload.slots[0];
      if (baseSlot.class_id !== targetClassId) {
        statusBar.set('Fach gehört zu einer anderen Klasse.', true);
        return false;
      }
      const newSlot = cloneSlot(baseSlot);
      newSlot.class_id = targetClassId;
      newSlot.tag = targetTag;
      newSlot.stunde = targetStunde;
      slotsToPlace = [newSlot];
    } else {
      const classIds = payload.slots.map(s => s.class_id);
      if (!classIds.includes(targetClassId)) {
        statusBar.set('Bandfach kann nur auf eine der beteiligten Klassen gezogen werden.', true);
        return false;
      }
      slotsToPlace = payload.slots.map(s => {
        const clone = cloneSlot(s);
        clone.tag = targetTag;
        clone.stunde = targetStunde;
        return clone;
      });
    }

    const skipKeys = new Set(payload.originKeys || []);
    if (!canPlaceSlots(slotsToPlace, skipKeys)) {
      statusBar.set('Lehrkraft ist bereits belegt.', true);
      return false;
    }

    if (!fromPalette) {
      (payload.originKeys || []).forEach(key => {
        state.editing.slotsMap.set(key, null);
      });
    } else if (payload.id) {
      removePaletteItem(payload.id, { silent: true });
    }

    slotsToPlace.forEach(slot => {
      const key = getSlotKey(slot.class_id, slot.tag, slot.stunde);
      state.editing.slotsMap.set(key, cloneSlot(slot));
    });

    setEditingDirty(true);
    return true;
  }

  function moveSlotToPalette() {
    if (!state.editing || !state.dragPayload) return false;
    if (state.dragPayload.source !== 'grid') return false;
    const payload = state.dragPayload.data;
    const item = {
      id: `parking-${++state.editingParkingSeq}`,
      type: payload.type,
      subjectId: payload.subjectId,
      teacherId: payload.teacherId,
      canonicalSubjectId: payload.canonicalSubjectId,
      slots: payload.slots.map(cloneSlot),
    };

    (payload.originKeys || []).forEach(key => {
      state.editing.slotsMap.set(key, null);
    });
    state.editing.parking.push(item);
    setEditingDirty(true);
    return true;
  }

  function canPlaceSlots(slots, skipKeys = new Set()) {
    for (const slot of slots) {
      const key = getSlotKey(slot.class_id, slot.tag, slot.stunde);
      const occupant = state.editing.slotsMap.get(key);
      if (occupant && !skipKeys.has(key)) {
        return false;
      }
    }

    for (const slot of slots) {
      const teacherId = slot.teacher_id;
      if (!teacherId) continue;
      const canonicalId = getCanonicalSubjectId(slot.subject_id);
      for (const [key, value] of state.editing.slotsMap.entries()) {
        if (!value) continue;
        if (skipKeys.has(key)) continue;
        if (value.tag !== slot.tag || value.stunde !== slot.stunde) continue;
        if (value.teacher_id !== teacherId) continue;
        const otherCanonical = getCanonicalSubjectId(value.subject_id);
        if (canonicalId !== otherCanonical) {
          return false;
        }
      }
      for (const other of slots) {
        if (other === slot) continue;
        if (other.tag === slot.tag && other.stunde === slot.stunde && other.teacher_id === teacherId) {
          const otherCanonical = getCanonicalSubjectId(other.subject_id);
          if (canonicalId !== otherCanonical) {
            return false;
          }
        }
      }
    }
    return true;
  }

  async function handleSaveEditing() {
    if (!state.editing) return;
    if (state.editing.parking.length) {
      statusBar.set('Bitte zuerst alle Fächer aus der Zwischenablage positionieren.', true);
      return;
    }
    const slots = [];
    state.editing.slotsMap.forEach(value => {
      if (!value) return;
      slots.push(cloneSlot(value));
    });
    slots.sort((a, b) => {
      const idxA = TAGE.indexOf(a.tag);
      const idxB = TAGE.indexOf(b.tag);
      const dayA = idxA === -1 ? a.tag : idxA;
      const dayB = idxB === -1 ? b.tag : idxB;
      if (dayA < dayB) return -1;
      if (dayA > dayB) return 1;
      if (a.stunde === b.stunde) {
        return a.class_id - b.class_id;
      }
      return a.stunde - b.stunde;
    });
    try {
      statusBar.set('Speichere bearbeiteten Plan…');
      const detail = await updatePlanSlots(state.editing.planId, slots);
      state.editing.slotsOriginal = cloneSlotsArray(detail.slots || []);
      state.editing.slotsMap = buildSlotsMapFromArray(detail.slots || []);
      state.editing.parking = [];
      state.editing.dirty = false;

      state.generatedPlans = state.generatedPlans.map(entry =>
        entry.id === detail.id
          ? { ...entry, slots: cloneSlotsArray(detail.slots || []), name: detail.name, comment: detail.comment }
          : entry
      );
      if (state.lastPlanId === detail.id) {
        state.planName = detail.name || state.planName;
        state.planComment = detail.comment || state.planComment;
      }
      statusBar.set('Plan gespeichert.');
      setTimeout(statusBar.clear, 1500);
      renderResults();
    } catch (err) {
      statusBar.set(`Speichern fehlgeschlagen: ${formatError(err)}`, true);
    }
  }

  function renderActiveRuleBadges(planEntry) {
    if (!planEntry.ruleKeysActive || !planEntry.ruleKeysActive.length) {
      return null;
    }
    const block = document.createElement('div');
    block.className = 'space-y-2';
    const heading = document.createElement('p');
    heading.className = 'text-xs font-semibold uppercase tracking-wide opacity-70';
    heading.textContent = 'Aktive Regeln';
    const list = document.createElement('div');
    list.className = 'flex flex-wrap items-center gap-1.5';
    planEntry.ruleKeysActive.forEach(key => {
      const ruleDef = state.ruleDefinitionByKey.get(key);
      const badge = document.createElement('span');
      badge.className = 'badge badge-sm badge-outline';
      badge.textContent = ruleDef?.label || key;
      if (ruleDef?.info) {
        badge.title = ruleDef.info;
      }
      list.appendChild(badge);
    });
    block.append(heading, list);
    return list.childElementCount ? block : null;
  }

  async function loadAnalysis() {
    if (!state.selectedVersionId) {
      state.analysis = null;
      state.analysisError = 'Keine Stundenverteilung gewählt.';
      return;
    }
    try {
      const res = await fetch(`/plans/analyze?version_id=${state.selectedVersionId}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      const data = await res.json();
      state.analysis = data;
      state.analysisError = null;
    } catch (err) {
      state.analysis = null;
      state.analysisError = formatError(err);
    }
  }

  function renderAnalysis() {
    analysisSection.innerHTML = '';
    if (state.activeTab !== 'analysis') {
      analysisSection.classList.add('hidden');
      resultsSection.classList.remove('hidden');
      return;
    }
    resultsSection.classList.add('hidden');
    analysisSection.classList.remove('hidden');

    if (state.analysisError) {
      const alert = document.createElement('div');
      alert.className = 'alert alert-error text-sm';
      alert.textContent = state.analysisError;
      analysisSection.appendChild(alert);
      return;
    }

    const data = state.analysis;
    if (!data || data.empty) {
      const info = document.createElement('div');
      info.className = 'alert alert-info';
      info.textContent = 'Keine Daten für die Analyse vorhanden.';
      analysisSection.appendChild(info);
      return;
    }

    const layout = document.createElement('div');
    layout.className = 'grid gap-6 lg:grid-cols-2';

    layout.appendChild(renderAnalysisCard('Klassen – Wochenstunden', renderSimpleTable(
      ['Klasse', 'Stunden'],
      (data.classes || []).map(item => [item.klasse, item.stunden])
    )));

    layout.appendChild(renderAnalysisCard('Lehrer – Deputat', renderSimpleTable(
      ['Lehrer', 'Stunden', 'Deputat'],
      (data.teachers || []).map(item => [item.lehrer, item.stunden, item.deputat])
    )));

    layout.appendChild(renderAnalysisCard('Klasse × Fach', renderSimpleTable(
      ['Klasse', 'Fach', 'Stunden'],
      (data.class_subjects || []).map(item => [item.klasse, item.fach, item.stunden])
    )));

    const flagsCard = document.createElement('div');
    flagsCard.className = 'card bg-base-100 border border-base-200 shadow-sm';
    const flagsBody = document.createElement('div');
    flagsBody.className = 'card-body space-y-3';
    flagsBody.innerHTML = '<h3 class="card-title text-sm">Flags</h3>';
    const list = document.createElement('div');
    list.className = 'space-y-2 text-sm';
    const flags = data.flags || {};
    Object.entries(flags).forEach(([key, value]) => {
      const row = document.createElement('div');
      row.innerHTML = `<span class="font-medium">${key}:</span> <span class="opacity-70">${JSON.stringify(value)}</span>`;
      list.appendChild(row);
    });
    if (!Object.keys(flags).length) {
      const row = document.createElement('div');
      row.className = 'opacity-60';
      row.textContent = 'Keine speziellen Flags vorhanden.';
      list.appendChild(row);
    }
    flagsBody.appendChild(list);
    flagsCard.appendChild(flagsBody);
    layout.appendChild(flagsCard);

    analysisSection.appendChild(layout);
  }

  function renderAnalysisCard(title, content) {
    const card = document.createElement('div');
    card.className = 'card bg-base-100 border border-base-200 shadow-sm';
    const body = document.createElement('div');
    body.className = 'card-body space-y-3';
    const heading = document.createElement('h3');
    heading.className = 'card-title text-sm';
    heading.textContent = title;
    body.append(heading, content);
    card.appendChild(body);
    return card;
  }

  function renderSimpleTable(headers, rows) {
    const table = document.createElement('table');
    table.className = 'table table-zebra table-compact';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headers.forEach(header => {
      const th = document.createElement('th');
      th.textContent = header;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach(row => {
      const tr = document.createElement('tr');
      row.forEach((value, idx) => {
        const td = document.createElement('td');
        td.textContent = value ?? '';
        td.className = idx === 0 ? 'font-medium' : 'opacity-80';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = headers.length;
      td.className = 'text-center opacity-60 text-sm';
      td.textContent = 'Keine Daten vorhanden';
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    return table;
  }

  tabs.onChange(id => {
    state.activeTab = id;
    renderResults();
    renderAnalysis();
  });

  function createParamRowCheckbox(label, hint, key) {
    const row = document.createElement('label');
    row.className = 'flex items-center justify-between gap-3 p-3 rounded-lg border border-base-200 bg-base-100';
    const info = document.createElement('div');
    info.className = 'flex flex-col';
    const heading = document.createElement('span');
    heading.className = 'font-medium text-sm';
    heading.textContent = label;
    const sub = document.createElement('span');
    sub.className = 'text-xs opacity-70';
    sub.textContent = hint;
    info.append(heading, sub);
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'toggle toggle-primary';
    toggle.checked = !!state.params[key];
    toggle.addEventListener('change', () => {
      state.params[key] = toggle.checked;
      updateRulesSummary();
      markDebugStale();
    });
    row.append(info, toggle);
    state.paramInputs.set(key, { type: 'checkbox', element: toggle });
    return row;
  }

  function createParamRowNumber(label, hint, key, opts = {}) {
    const row = document.createElement('div');
    row.className = 'flex flex-col gap-1 p-3 rounded-lg border border-base-200 bg-base-100';
    const heading = document.createElement('span');
    heading.className = 'font-medium text-sm';
    heading.textContent = label;
    const sub = document.createElement('span');
    sub.className = 'text-xs opacity-70';
    sub.textContent = hint;
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'input input-bordered input-sm w-32';
    if (opts.min != null) input.min = String(opts.min);
    if (opts.max != null) input.max = String(opts.max);
    if (opts.step != null) input.step = String(opts.step);
    if (state.params[key] !== undefined) {
      input.value = String(state.params[key]);
    }
    input.addEventListener('change', () => {
      let value = Number(input.value);
      if (Number.isNaN(value)) {
        value = state.params[key];
      } else {
        if (opts.min != null) value = Math.max(opts.min, value);
        if (opts.max != null) value = Math.min(opts.max, value);
      }
      state.params[key] = value;
      input.value = String(value);
      updateRulesSummary();
      markDebugStale();
    });
    row.append(heading, sub, input);
    state.paramInputs.set(key, { type: 'number', element: input });
    return row;
  }

  function createClassFilterBar() {
    if (!state.classes.size) return null;

    const wrap = document.createElement('div');
    wrap.className = 'flex flex-wrap items-center gap-3 mb-4';

    const label = document.createElement('span');
    label.className = 'text-sm font-semibold';
    label.textContent = 'Klassenansicht:';
    wrap.appendChild(label);

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'btn btn-xs btn-outline';
    allBtn.textContent = 'Alle';
    allBtn.disabled = state.visibleClasses.size === state.classes.size;
    allBtn.addEventListener('click', () => {
      state.visibleClasses = new Set(state.classes.keys());
      renderResults();
    });
    wrap.appendChild(allBtn);

    state.classes.forEach((cls, classId) => {
      const option = document.createElement('label');
      option.className = 'flex items-center gap-2 px-3 py-1 rounded-lg border border-base-300 bg-base-100 text-sm';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'checkbox checkbox-xs';
      checkbox.checked = state.visibleClasses.has(classId);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          state.visibleClasses.add(classId);
        } else {
          state.visibleClasses.delete(classId);
          if (!state.visibleClasses.size) {
            state.visibleClasses.add(classId);
          }
        }
        renderResults();
      });

      const nameSpan = document.createElement('span');
      nameSpan.textContent = getClassName(classId);

      option.append(checkbox, nameSpan);
      wrap.appendChild(option);
    });

    return wrap;
  }
  function getClassName(arg1, arg2) {
    if (arg2 !== undefined) {
      const classesMap = arg1 instanceof Map ? arg1 : state.classes;
      const classId = arg2;
      return classesMap.get(classId)?.name || `Klasse #${classId}`;
    }
    const classId = arg1;
    return state.classes.get(classId)?.name || `Klasse #${classId}`;
  }

  function colorToRgba(hex, alpha) {
    if (typeof hex !== 'string') return null;
    const cleaned = hex.trim().replace('#', '');
    if (cleaned.length !== 6) return null;
    const num = Number.parseInt(cleaned, 16);
    if (Number.isNaN(num)) return null;
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return container;
}

function createField(label, control) {
  const field = document.createElement('label');
  field.className = 'form-control w-full space-y-1';
  const title = document.createElement('span');
  title.className = 'label-text font-medium';
  title.textContent = label;
  field.appendChild(title);
  field.appendChild(control);
  return field;
}

function createStatusBar() {
  const element = document.createElement('div');
  element.className = 'text-sm opacity-70 min-h-[1.5rem]';
  return {
    element,
    set(message, error = false) {
      element.textContent = message || '';
      element.className = `text-sm ${error ? 'text-error' : 'text-success'} min-h-[1.5rem]`;
    },
    clear() {
      element.textContent = '';
      element.className = 'text-sm opacity-70 min-h-[1.5rem]';
    },
  };
}

function createProgressModal() {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal';

  const box = document.createElement('div');
  box.className = 'modal-box space-y-4 text-center';

  const visualWrap = document.createElement('div');
  visualWrap.className = 'flex justify-center';
  const spinner = document.createElement('span');
  spinner.className = 'loading loading-spinner loading-lg text-primary';
  const successIcon = document.createElement('span');
  successIcon.className = 'hidden text-4xl';
  successIcon.textContent = '🎉';
  visualWrap.append(spinner, successIcon);

  const title = document.createElement('h3');
  title.className = 'font-semibold text-lg';
  title.textContent = 'Plan wird erstellt…';

  const message = document.createElement('p');
  message.className = 'text-sm opacity-70';
  message.textContent = 'Bitte warte einen Moment, der Solver sucht nach einer passenden Lösung.';

  const actionWrap = document.createElement('div');
  actionWrap.className = 'modal-action justify-center hidden';
  const okButton = document.createElement('button');
  okButton.type = 'button';
  okButton.className = 'btn btn-primary';
  okButton.textContent = 'OK';
  actionWrap.appendChild(okButton);

  box.append(visualWrap, title, message, actionWrap);

  const backdrop = document.createElement('form');
  backdrop.method = 'dialog';
  backdrop.className = 'modal-backdrop';
  const closeButton = document.createElement('button');
  closeButton.textContent = 'Schließen';
  backdrop.appendChild(closeButton);

  dialog.append(box, backdrop);
  document.body.appendChild(dialog);

  let mode = 'idle';
  let confirmHandler = null;

  function showLoading() {
    mode = 'loading';
    confirmHandler = null;
    spinner.classList.remove('hidden');
    spinner.style.display = 'inline-flex';
    successIcon.classList.add('hidden');
    actionWrap.classList.add('hidden');
    title.textContent = 'Plan wird erstellt…';
    message.textContent = 'Bitte warte einen Moment, der Solver sucht nach einer passenden Lösung.';
    if (!dialog.open) dialog.showModal();
  }

  function showSuccess({ title: titleText = 'Fertig!', message: messageText = 'Der Solver hat erfolgreich einen Plan erzeugt.', onConfirm } = {}) {
    mode = 'success';
    spinner.classList.add('hidden');
    spinner.style.display = 'none';
    successIcon.classList.remove('hidden');
    actionWrap.classList.remove('hidden');
    title.textContent = titleText;
    message.textContent = messageText;
    confirmHandler = typeof onConfirm === 'function' ? onConfirm : null;
    if (!dialog.open) dialog.showModal();
  }

  function close() {
    mode = 'idle';
    confirmHandler = null;
    if (dialog.open) dialog.close();
  }

  function isOpen() {
    return dialog.open;
  }

  okButton.addEventListener('click', () => {
    if (confirmHandler) confirmHandler();
    close();
  });

  backdrop.addEventListener('submit', event => {
    event.preventDefault();
    if (mode === 'loading') return;
    if (confirmHandler) confirmHandler();
    close();
  });

  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (mode === 'loading') return;
    if (confirmHandler) confirmHandler();
    close();
  });

  return {
    showLoading,
    showSuccess,
    close,
    isOpen,
  };
}
