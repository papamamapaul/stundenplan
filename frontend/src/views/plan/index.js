import { fetchPlanRules, fetchPlanDetail, generatePlan, updatePlan, updatePlanSlots } from '../../api/plans.js';
import { createPlanGrid } from '../../components/PlanGrid.js';
import { fetchRuleProfiles } from '../../api/ruleProfiles.js';
import { fetchVersions } from '../../api/versions.js';
import { fetchSubjects } from '../../api/subjects.js';
import { fetchClasses } from '../../api/classes.js';
import { fetchTeachers } from '../../api/teachers.js';
import { fetchRooms } from '../../api/rooms.js';
import { fetchBasisplan } from '../../api/basisplan.js';
import { formatError, formModal } from '../../utils/ui.js';
import { createTabs } from '../../components/Tabs.js';
import { openPlanPrintModal } from '../../components/PlanPrintModal.js';
import { getActivePlanningPeriod, ensurePlanningPeriodsLoaded, subscribePlanningPeriods } from '../../store/planningPeriods.js';
import { buildAccountQuery } from '../../api/helpers.js';
import { navigateTo } from '../../router.js';
import {
  DEFAULT_PARAMS,
  RULE_DEFAULTS_STORAGE_KEY,
  RULE_GROUPS,
  RULE_EXTRAS,
  defaultPlanName,
} from './constants.js';
import { createInitialPlanState } from './state.js';
import { createPlanToolbar, updatePlanToolbar } from './components/toolbar.js';
import { createRunSummarySection } from './components/runSummary.js';
import { createRulesPanel } from './components/rulesPanel.js';
import { createPlanEditorSection } from './components/editorSection.js';
import { createSolverControls } from './components/solverControls.js';
import { createDebugPanel } from './components/debugPanel.js';
import { createAnalysisPanel } from './components/analysisPanel.js';

const BASISPLAN_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const BASISPLAN_DAY_TO_TAG = {
  mon: 'Mo',
  tue: 'Di',
  wed: 'Mi',
  thu: 'Do',
  fri: 'Fr',
};

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

  const periodInfo = document.createElement('p');
  periodInfo.className = 'text-xs opacity-60';
  const activePeriod = getActivePlanningPeriod();
  periodInfo.textContent = activePeriod
    ? `Aktive Planungsperiode: ${activePeriod.name}`
    : 'Keine Planungsperiode ausgewählt.';
  header.appendChild(periodInfo);

  const statusBar = createStatusBar();

  const versionSelect = document.createElement('select');
  versionSelect.className = 'select select-bordered w-full';

  const ruleProfileSelect = document.createElement('select');
  ruleProfileSelect.className = 'select select-bordered w-full';

  const sidebar = document.createElement('aside');
  sidebar.className = 'w-full xl:w-80 bg-white border border-gray-200 rounded-xl flex flex-col shadow-sm';

  const sidebarHeader = document.createElement('div');
  sidebarHeader.className = 'p-4 border-b border-gray-200 space-y-4 bg-white';
  sidebar.appendChild(sidebarHeader);

  const headerIntro = document.createElement('div');
  headerIntro.className = 'space-y-1';
  headerIntro.innerHTML = `
    <h2 class="text-base font-semibold text-gray-900">Regeln & Parameter</h2>
    <p class="text-xs text-gray-500">Stundenverteilung wählen, Regeln anpassen und den Solver starten.</p>
  `;
  sidebarHeader.appendChild(headerIntro);

  const selectionWrap = document.createElement('div');
  selectionWrap.className = 'space-y-3';
  sidebarHeader.appendChild(selectionWrap);

  const versionField = document.createElement('label');
  versionField.className = 'flex flex-col gap-1 text-sm text-gray-700';
  const versionLabel = document.createElement('span');
  versionLabel.className = 'font-medium';
  versionLabel.textContent = 'Stundenverteilung';
  versionSelect.className = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent';
  versionField.append(versionLabel, versionSelect);

  const ruleProfileField = document.createElement('label');
  ruleProfileField.className = 'flex flex-col gap-1 text-sm text-gray-700';
  const ruleProfileLabel = document.createElement('span');
  ruleProfileLabel.className = 'font-medium';
  ruleProfileLabel.textContent = 'Regelprofil';
  ruleProfileSelect.className = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent';
  ruleProfileField.append(ruleProfileLabel, ruleProfileSelect);

  selectionWrap.append(versionField, ruleProfileField);

  const infoWrap = document.createElement('div');
  infoWrap.className = 'space-y-2';
  const badgeWrap = document.createElement('div');
  badgeWrap.className = 'flex flex-wrap items-center gap-2 text-xs';
  infoWrap.appendChild(badgeWrap);
  sidebarHeader.appendChild(infoWrap);

  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'flex flex-col gap-2';
  sidebarHeader.appendChild(actionsWrap);

  const sidebarContent = document.createElement('div');
  sidebarContent.className = 'flex-1 overflow-y-auto bg-gray-50 p-4 space-y-3';
  sidebar.appendChild(sidebarContent);

  const resultsSection = document.createElement('div');
  resultsSection.className = 'space-y-4';

  const tabs = createTabs([
    { id: 'results', label: 'Ergebnisse' },
    { id: 'analysis', label: 'Analyse' },
  ]);

  const tabContent = document.createElement('div');
  tabContent.className = 'mt-4';

  const analysisHost = document.createElement('div');
  analysisHost.className = 'space-y-4 hidden';

  tabContent.append(resultsSection, analysisHost);

  const solverContainer = document.createElement('div');
  solverContainer.className = 'space-y-3';
  const debugHost = document.createElement('div');
  debugHost.className = 'space-y-3';

  const advancedDetails = document.createElement('details');
  advancedDetails.className = 'rounded-lg border border-gray-200 bg-white';
  const advancedSummary = document.createElement('summary');
  advancedSummary.className = 'flex items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-gray-800 cursor-pointer select-none';
  advancedSummary.style.listStyle = 'none';
  advancedSummary.style.outline = 'none';
  const advancedLabel = document.createElement('span');
  advancedLabel.textContent = 'Erweiterte Einstellungen & Regelsimulation';
  const advancedIcon = document.createElement('span');
  advancedIcon.className = 'text-gray-400 transition-transform duration-200';
  advancedIcon.textContent = '▾';
  advancedSummary.append(advancedLabel, advancedIcon);
  const advancedContent = document.createElement('div');
  advancedContent.className = 'px-4 pb-4 space-y-3 text-sm';
  advancedContent.append(solverContainer, debugHost);
  advancedDetails.append(advancedSummary, advancedContent);
  advancedIcon.style.transform = 'rotate(0deg)';
  advancedDetails.addEventListener('toggle', () => {
    advancedIcon.style.transform = advancedDetails.open ? 'rotate(180deg)' : 'rotate(0deg)';
  });

  sidebarContent.appendChild(advancedDetails);

  const layout = document.createElement('div');
  layout.className = 'plan-view-layout';

  const planColumn = document.createElement('div');
  planColumn.className = 'space-y-6';
  const planToolbar = createPlanToolbar(tabs);
  planColumn.append(planToolbar.element, tabs.nav, tabContent);

  const detailsColumn = document.createElement('div');
  detailsColumn.className = 'space-y-6';

  const { aside: summaryAside, refs: summaryRefs } = createRunSummarySection();
  detailsColumn.appendChild(summaryAside);

  layout.append(sidebar, planColumn, detailsColumn);

  container.append(header, statusBar.element, layout);

  const runSummaryRefs = summaryRefs;

  const state = createInitialPlanState({
    initialPlanId,
    planToolbar,
    runSummaryRefs,
  });

  const rulesPanel = createRulesPanel({
    state,
    ruleGroups: RULE_GROUPS,
    ruleExtras: RULE_EXTRAS,
    onRulesChanged: updateRulesSummary,
    onDebugStale: markDebugStale,
  });
  sidebarContent.insertBefore(rulesPanel.element, advancedDetails);

  const progressModal = createProgressModal();

  const planEditor = createPlanEditorSection({
    state,
    statusBar,
    formatError,
    updatePlanSlots,
    onRequestRender: renderResults,
    toggleHighlightedTeacher,
    isTeacherHighlighted,
    getClassName,
  });

  const solverControls = createSolverControls({
    state,
    onParamChange: () => {
      updateRulesSummary();
      markDebugStale();
    },
  });
  solverContainer.replaceWith(solverControls.element);

  const debugPanel = createDebugPanel({
    state,
    statusBar,
    generatePlan,
    buildOverrides,
    collectRuleSnapshot,
    formatError,
  });
  debugPanel.renderDebugResults();
  debugHost.replaceWith(debugPanel.element);

  const analysisPanel = createAnalysisPanel({ state });
  analysisHost.replaceWith(analysisPanel.element);

  planToolbar.primaryButton.addEventListener('click', async () => {
    if (state.generating) return;
    if (!state.selectedVersionId) {
      statusBar.set('Bitte zuerst eine Stundenverteilung auswählen.', true);
      return;
    }
    await handleGenerate();
  });

  const rulesProfileBadge = document.createElement('span');
  rulesProfileBadge.className = 'badge badge-sm badge-outline';
  rulesProfileBadge.textContent = 'Profil: Standard';

  const rulesOverridesBadge = document.createElement('span');
  rulesOverridesBadge.className = 'badge badge-sm badge-outline';
  rulesOverridesBadge.textContent = 'Overrides: 0';

  const rulesSummaryInfo = document.createElement('p');
  rulesSummaryInfo.className = 'text-xs text-gray-500';
  rulesSummaryInfo.textContent = 'Regelprofil bestimmt die Ausgangswerte. Änderungen gelten nur für die nächste Berechnung.';
  infoWrap.appendChild(rulesSummaryInfo);
  badgeWrap.append(rulesProfileBadge, rulesOverridesBadge);

  const generateButton = document.createElement('button');
  generateButton.type = 'button';
  generateButton.className = 'btn btn-primary btn-sm w-full';
  generateButton.textContent = 'Plan erstellen';
  actionsWrap.appendChild(generateButton);

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'btn btn-outline btn-sm';
  saveButton.textContent = 'Speichern unter…';
  saveButton.disabled = true;

  versionSelect.addEventListener('change', () => {
    state.selectedVersionId = versionSelect.value ? Number(versionSelect.value) : null;
    loadAnalysis().then(renderAnalysisPanel).catch(() => {});
    syncParamControls();
    updateRulesSummary();
    markDebugStale();
    refreshToolbar();
  });

  ruleProfileSelect.addEventListener('change', () => {
    const value = ruleProfileSelect.value ? Number(ruleProfileSelect.value) : null;
    state.selectedRuleProfileId = Number.isNaN(value) ? null : value;
    applyRuleProfile();
    syncRuleControls();
    updateRulesSummary();
    markDebugStale();
    refreshToolbar();
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

  const unsubscribePlanningPeriods = subscribePlanningPeriods(({ activeId }) => {
    if (state.loading) return;
    if (state.activePlanningPeriodId === activeId) return;
    state.activePlanningPeriodId = activeId;
    refreshToolbar();
    reloadVersions();
  });

  initialize().catch(err => {
    statusBar.set(`Fehler beim Laden: ${formatError(err)}`, true);
  });

  async function initialize() {
    statusBar.set('Lade Daten…');
    state.loading = true;
    try {
      await ensurePlanningPeriodsLoaded();
      const activePeriod = getActivePlanningPeriod();
      state.activePlanningPeriodId = activePeriod?.id ?? null;
      const [versions, rules, profiles, subjects, classes, teachers, rooms, basisplan] = await Promise.all([
        fetchVersions(),
        fetchPlanRules(),
        fetchRuleProfiles(),
        fetchSubjects(),
        fetchClasses(),
        fetchTeachers(),
        fetchRooms(),
        fetchBasisplan(),
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
      state.rooms = new Map(rooms.map(room => [room.id, room]));
      state.classWindows = buildClassWindowsMap(basisplan?.data, classes);
      state.visibleClasses = new Set(classes.map(cls => cls.id));

      initializeRuleValues();
      loadPersistedRuleDefaults();
      renderRuleProfiles();
      renderRules();
      solverControls.render();
      renderVersionOptions();
      syncRuleControls();
      syncParamControls();
      if (initialPlanId) {
        await loadExistingPlan(initialPlanId);
      } else {
        renderResults();
      }
      await loadAnalysis();
      renderAnalysisPanel();
      debugPanel.renderDebugResults();
      refreshToolbar();
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
        slotsMeta: detail.slots_meta || [],
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

  async function reloadVersions() {
    try {
      const versions = await fetchVersions();
      state.versions = versions;
      if (!versions.length) {
        state.selectedVersionId = null;
      } else if (!state.selectedVersionId || !versions.some(v => v.id === state.selectedVersionId)) {
        state.selectedVersionId = versions[0]?.id ?? null;
      }
      renderVersionOptions();
      renderResults();
      updateRulesSummary();
    } catch (err) {
      statusBar.set(`Stundenverteilungen konnten nicht geladen werden: ${formatError(err)}`, true);
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
    loadAnalysis().then(renderAnalysisPanel).catch(() => {});
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
    rulesPanel.render();
    loadAnalysis().then(renderAnalysisPanel).catch(() => {});
  }

  function syncRuleControls() {
    if (rulesPanel) {
      rulesPanel.syncInputs();
    }
    syncParamControls();
  }

  function syncParamControls() {
    if (solverControls) {
      solverControls.sync();
    }
  }

  async function handleGenerate() {
    state.generating = true;
    generateButton.disabled = true;
    saveButton.disabled = true;
    progressModal.showLoading();
    refreshToolbar();
    renderRunSummary();
    try {
      const baseName = defaultPlanName();
      const planComment = '';
      state.planName = baseName;
      state.planComment = planComment;
      const overrides = buildOverrides();
      const overridePayload = Object.keys(overrides).length ? overrides : null;
      const paramsSnapshot = { ...state.params };
      const basePayload = {
        comment: planComment ? planComment : null,
        version_id: state.selectedVersionId,
        rule_profile_id: state.selectedRuleProfileId,
        override_rules: overridePayload,
        params: paramsSnapshot,
      };
      let finalPlanName = baseName;

      const attemptGenerate = async (attempt = 1) => {
        const candidateName = attempt === 1 ? baseName : `${baseName} (${attempt})`;
        try {
          const response = await generatePlan({
            ...basePayload,
            name: candidateName,
            params: { ...basePayload.params },
          });
          finalPlanName = candidateName;
          return response;
        } catch (err) {
          const message = formatError(err);
          if (
            typeof message === 'string' &&
            message.toLowerCase().includes('planname bereits vergeben') &&
            attempt < 5
          ) {
            return attemptGenerate(attempt + 1);
          }
          throw err;
        }
      };

      const response = await attemptGenerate();
      state.planName = finalPlanName;
      const planEntry = {
        id: response.plan_id,
        status: response.status,
        score: response.score,
        objective_value: response.objective_value,
        slots: response.slots || [],
        slotsMeta: response.slots_meta || [],
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
        renderAnalysisPanel();
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
      refreshToolbar();
      renderRunSummary();
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

  function markDebugStale() {
    if (debugPanel && typeof debugPanel.markStale === 'function') {
      debugPanel.markStale();
    } else {
      state.debugStale = true;
    }
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
    renderRunSummary();
    refreshToolbar();
  }

  function refreshToolbar() {
    updatePlanToolbar(state.planToolbar, state);
  }

  function renderResults() {
    refreshToolbar();
    renderRunSummary();
    resultsSection.innerHTML = '';
    if (planEditor) {
      planEditor.renderEditingSection();
      if (planEditor.element.parentElement !== resultsSection) {
        resultsSection.appendChild(planEditor.element);
      }
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

    if (!state.editing && planEditor) {
      resultsSection.appendChild(planEditor.renderTeacherHighlightControls());
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
        editBtn.addEventListener('click', () => planEditor.startEditingPlan(entry));
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
            rooms: state.rooms,
            classWindows: state.classWindows,
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
        slotsMeta: entry.slotsMeta || [],
        classes: state.classes,
        subjects: state.subjects,
        teachers: state.teachers,
        rooms: state.rooms,
        classWindows: state.classWindows,
        visibleClasses: state.visibleClasses,
        highlightedTeacherId: state.highlightedTeacherId,
      }));

      card.appendChild(body);
      resultsSection.appendChild(card);
    });
  }

  function renderRunSummary() {
    const summary = state.runSummary;
    if (!summary) return;

    const {
      headerBadge,
      headerTitle,
      headerSubtitle,
      headerMeta,
      headerButton,
      statusValue,
      statusTimestamp,
      rulesContainer,
      rulesPlaceholder,
      metaEntries,
    } = summary;

    const planEntry = state.generatedPlans[0] || null;
    const statusBaseClass = 'text-sm font-semibold';

    const selectedVersionName = state.selectedVersionId
      ? state.versions.find(v => v.id === state.selectedVersionId)?.name || `Version #${state.selectedVersionId}`
      : null;
    const planVersionName = planEntry?.versionId != null
      ? state.versions.find(v => v.id === planEntry.versionId)?.name || `Version #${planEntry.versionId}`
      : selectedVersionName;
    const profileName = state.ruleProfiles.find(p => p.id === state.selectedRuleProfileId)?.name || 'Standard';

    const badgeSource = planEntry?.name || planVersionName || 'Plan';
    const initials = badgeSource ? badgeSource.replace(/\s+/g, '').slice(0, 2).toUpperCase() : '';
    headerBadge.textContent = initials || 'PL';
    headerTitle.textContent = 'Plan-Details';
    headerSubtitle.textContent = planEntry?.name || 'Noch kein Plan';
    headerMeta.textContent = planEntry ? `Plan-ID: ${planEntry.id ?? '—'}` : `Stundenverteilung: ${planVersionName ?? '—'}`;

    headerButton.disabled = false;
    headerButton.onclick = null;
    if (planEntry) {
      headerButton.textContent = 'Plan bearbeiten';
      headerButton.onclick = () => planEditor.startEditingPlan(planEntry);
      headerMeta.textContent = `Plan-ID: ${planEntry.id ?? '—'} • ${planVersionName ?? '—'}`;
    } else {
      headerButton.textContent = 'Planliste';
      headerButton.onclick = () => navigateTo('#/plans');
    }

    const meta = metaEntries || new Map();
    if (meta.has('version')) meta.get('version').textContent = planVersionName ?? '—';
    if (meta.has('profile')) meta.get('profile').textContent = profileName ?? '—';

    if (state.generating) {
      statusValue.textContent = 'Berechnung läuft…';
      statusValue.className = `${statusBaseClass} text-blue-600`;
      statusTimestamp.textContent = planEntry ? 'Solver aktiv – letzter Stand folgt…' : 'Solver aktiv …';
    }

    if (!planEntry) {
      if (!state.generating) {
        statusValue.textContent = 'Keine Berechnung';
        statusValue.className = `${statusBaseClass} text-gray-900`;
        statusTimestamp.textContent = '—';
      }
      if (meta.has('planId')) meta.get('planId').textContent = '—';
      if (meta.has('score')) meta.get('score').textContent = '—';
      if (meta.has('objective')) meta.get('objective').textContent = '—';
      if (meta.has('generated')) meta.get('generated').textContent = '—';
      if (meta.has('comment')) meta.get('comment').textContent = '—';
      rulesContainer.innerHTML = '';
      rulesPlaceholder.textContent = 'Noch kein Plan berechnet.';
      rulesContainer.appendChild(rulesPlaceholder);
      return;
    }

    const createdAt = planEntry.createdAt instanceof Date
      ? planEntry.createdAt
      : (planEntry.createdAt ? new Date(planEntry.createdAt) : null);

    if (meta.has('planId')) meta.get('planId').textContent = planEntry.id ? `#${planEntry.id}` : '—';
    if (meta.has('score')) meta.get('score').textContent = planEntry.score != null ? planEntry.score.toFixed(2) : '—';
    if (meta.has('objective')) {
      const objective = planEntry.objective_value;
      meta.get('objective').textContent = objective != null ? Number(objective).toFixed(2) : '—';
    }
    if (meta.has('generated')) {
      meta.get('generated').textContent = createdAt ? formatSummaryDate(createdAt) : '—';
    }
    if (meta.has('comment')) meta.get('comment').textContent = planEntry.comment?.trim() || '—';

    if (!state.generating) {
      const normalizedStatus = (planEntry.status || '').toLowerCase();
      let statusClass = 'text-emerald-600';
      if (normalizedStatus.includes('fehl') || normalizedStatus.includes('error')) {
        statusClass = 'text-error';
      } else if (normalizedStatus.includes('warn') || normalizedStatus.includes('warte') || normalizedStatus.includes('pending')) {
        statusClass = 'text-yellow-600';
      }
      statusValue.textContent = planEntry.status || 'Plan erstellt';
      statusValue.className = `${statusBaseClass} ${statusClass}`;
      statusTimestamp.textContent = createdAt ? `Berechnet am ${formatSummaryDate(createdAt)}` : '—';
    } else if (createdAt) {
      statusTimestamp.textContent = `Letzter Lauf: ${formatSummaryDate(createdAt)}`;
    }

    const activeRules = planEntry.ruleKeysActive || [];
    rulesContainer.innerHTML = '';
    rulesPlaceholder.remove();
    if (activeRules.length) {
      activeRules.forEach(key => {
        const ruleDef = state.ruleDefinitionByKey.get(key);
        const badge = document.createElement('span');
        badge.className = 'inline-flex items-center px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold';
        badge.textContent = ruleDef?.label || key;
        if (ruleDef?.info) {
          badge.title = ruleDef.info;
        }
        rulesContainer.appendChild(badge);
      });
    } else {
      rulesPlaceholder.textContent = 'Keine aktiven Regeln gemeldet.';
      rulesContainer.appendChild(rulesPlaceholder);
    }
  }

  function formatSummaryDate(date) {
    try {
      return date.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
    } catch (err) {
      return date.toISOString();
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
      const query = buildAccountQuery({
        version_id: state.selectedVersionId,
        planning_period_id: state.activePlanningPeriodId ?? undefined,
      });
      const res = await fetch(`/plans/analyze${query}`);
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

  function renderAnalysisPanel() {
    if (!analysisPanel) return;
    analysisPanel.render(resultsSection);
  }

  tabs.onChange(id => {
    state.activeTab = id;
    if (state.planToolbar) {
      state.planToolbar.setActiveTab(id);
    }
    renderResults();
    renderAnalysisPanel();
  });

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

  window.addEventListener('beforeunload', () => {
    if (typeof unsubscribePlanningPeriods === 'function') {
      unsubscribePlanningPeriods();
    }
  });

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

function buildClassWindowsMap(basisplanData, classes = []) {
  if (!basisplanData || typeof basisplanData !== 'object') {
    return new Map();
  }
  const slotCount = Array.isArray(basisplanData?.meta?.slots) && basisplanData.meta.slots.length
    ? basisplanData.meta.slots.length
    : 8;
  const windows = basisplanData.windows || {};
  const defaultEntry = normalizeWindowEntry(windows.__all, slotCount);
  const classMap = new Map();
  classes.forEach(cls => {
    const classKey = cls.name || String(cls.id);
    const specificEntry = normalizeWindowEntry(windows[classKey], slotCount);
    const dayMap = new Map();
    BASISPLAN_DAY_KEYS.forEach(dayKey => {
      const tag = BASISPLAN_DAY_TO_TAG[dayKey];
      const base = defaultEntry[dayKey] || Array(slotCount).fill(true);
      const overrides = specificEntry[dayKey];
      const merged = base.map((value, idx) => (typeof overrides[idx] === 'boolean' ? overrides[idx] : value));
      dayMap.set(tag, merged);
    });
    classMap.set(cls.id, dayMap);
  });
  return classMap;
}

function normalizeWindowEntry(entry, slotCount) {
  const allowedSource = entry && typeof entry === 'object'
    ? entry.allowed || entry
    : {};
  const normalized = {};
  BASISPLAN_DAY_KEYS.forEach(dayKey => {
    const arr = Array.isArray(allowedSource?.[dayKey]) ? allowedSource[dayKey] : null;
    const values = Array.from({ length: slotCount }, (_, idx) => {
      if (arr && typeof arr[idx] === 'boolean') return arr[idx];
      return true;
    });
    normalized[dayKey] = values;
  });
  return normalized;
}
