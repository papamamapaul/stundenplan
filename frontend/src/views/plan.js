import { fetchPlanRules, generatePlan, updatePlan } from '../api/plans.js';
import { fetchRuleProfiles } from '../api/ruleProfiles.js';
import { fetchVersions } from '../api/versions.js';
import { fetchSubjects } from '../api/subjects.js';
import { fetchClasses } from '../api/classes.js';
import { fetchTeachers } from '../api/teachers.js';
import { formatError, formModal } from '../utils/ui.js';
import { createTabs } from '../components/Tabs.js';

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
const STUNDEN = Array.from({ length: 8 }, (_, idx) => idx + 1);
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

function defaultPlanName() {
  const now = new Date();
  return `Plan ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function createPlanView() {
  const container = document.createElement('section');
  container.className = 'space-y-6';

  const header = document.createElement('div');
  header.className = 'space-y-1';
  header.innerHTML = `
    <h1 class="text-2xl font-semibold">Planberechnung</h1>
    <p class="text-sm opacity-70">Wähle eine Stundenverteilung, konfiguriere Regeln und generiere Planvarianten.</p>
  `;

  const controlsWrap = document.createElement('div');
  controlsWrap.className = 'grid gap-6 xl:grid-cols-[minmax(320px,360px)_1fr]';

  const statusBar = createStatusBar();

  const planCard = document.createElement('article');
  planCard.className = 'card bg-base-100 shadow-sm border border-base-200';
  const planBody = document.createElement('div');
  planBody.className = 'card-body space-y-4';
  planCard.appendChild(planBody);

  const rulesSummaryCard = document.createElement('article');
  rulesSummaryCard.className = 'card bg-base-100 shadow-sm border border-base-200';
  const rulesSummaryBody = document.createElement('div');
  rulesSummaryBody.className = 'card-body space-y-3';
  rulesSummaryCard.appendChild(rulesSummaryBody);

  const resultsSection = document.createElement('div');
  resultsSection.className = 'space-y-4';

  const tabs = createTabs([
    { id: 'results', label: 'Ergebnisse' },
    { id: 'analysis', label: 'Analyse' },
  ]);

  const tabContent = document.createElement('div');
  tabContent.className = 'mt-4';

  const analysisSection = document.createElement('div');
  analysisSection.className = 'space-y-4 hidden';

  tabContent.append(resultsSection, analysisSection);

  controlsWrap.append(planCard, rulesSummaryCard);
  container.append(header, statusBar.element, controlsWrap, tabs.nav, tabContent);

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
  };

  const planNameInput = document.createElement('input');
  planNameInput.type = 'text';
  planNameInput.className = 'input input-bordered w-full';
  planNameInput.placeholder = 'z. B. Plan Variante A';

  const commentInput = document.createElement('textarea');
  commentInput.className = 'textarea textarea-bordered w-full';
  commentInput.rows = 3;
  commentInput.placeholder = 'Kommentar zum Plan (optional)';

  const versionSelect = document.createElement('select');
  versionSelect.className = 'select select-bordered w-full';

  const ruleProfileSelect = document.createElement('select');
  ruleProfileSelect.className = 'select select-bordered w-full';

  const generateButton = document.createElement('button');
  generateButton.type = 'button';
  generateButton.className = 'btn btn-primary';
  generateButton.textContent = 'Plan berechnen';

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'btn btn-outline';
  saveButton.textContent = 'Plan speichern';
  saveButton.disabled = true;

  const rulesButton = document.createElement('button');
  rulesButton.type = 'button';
  rulesButton.className = 'btn btn-outline';
  rulesButton.textContent = 'Regeln anpassen';

  const rulesModal = createRulesModal();
  const { element: rulesModalElement, boolsContainer, weightsContainer, open: openRulesModal, close: closeRulesModal, closeButton: rulesModalCloseButton } = rulesModal;
  container.appendChild(rulesModalElement);

  planBody.append(
    createField('Planname', planNameInput),
    createField('Kommentar', commentInput),
    createField('Stundenverteilung', versionSelect),
    createField('Regelprofil', ruleProfileSelect),
    createParamsAccordion(),
    createButtonRow([generateButton, saveButton, rulesButton]),
  );

  const rulesSummaryText = document.createElement('p');
  rulesSummaryText.className = 'text-sm opacity-70';
  rulesSummaryText.textContent = 'Nutze die aktuellen Regel-Einstellungen oder passe sie im Dialog an.';

  const rulesProfileBadge = document.createElement('span');
  rulesProfileBadge.className = 'badge badge-outline';
  rulesProfileBadge.textContent = 'Profil: Standard';

  const rulesOverridesBadge = document.createElement('span');
  rulesOverridesBadge.className = 'badge badge-outline';
  rulesOverridesBadge.textContent = 'Overrides: 0';

  const rulesSummaryInfo = document.createElement('div');
  rulesSummaryInfo.className = 'text-xs opacity-60 flex flex-col gap-1';
  const rulesInfoLine1 = document.createElement('span');
  rulesInfoLine1.textContent = 'Regelprofil bestimmt die Ausgangswerte.';
  const rulesInfoLine2 = document.createElement('span');
  rulesInfoLine2.textContent = 'Änderungen gelten nur für die nächste Berechnung.';
  rulesSummaryInfo.append(rulesInfoLine1, rulesInfoLine2);

  const rulesButtonSecondary = document.createElement('button');
  rulesButtonSecondary.type = 'button';
  rulesButtonSecondary.className = 'btn btn-sm btn-outline';
  rulesButtonSecondary.textContent = 'Regeln bearbeiten';
  rulesButtonSecondary.addEventListener('click', () => {
    syncRuleControls();
    updateRulesSummary();
    openRulesModal();
  });

  rulesSummaryBody.append(rulesSummaryText, rulesProfileBadge, rulesOverridesBadge, rulesSummaryInfo, rulesButtonSecondary);

  planNameInput.addEventListener('blur', () => {
    state.planName = planNameInput.value.trim() || defaultPlanName();
    planNameInput.value = state.planName;
  });

  commentInput.addEventListener('blur', () => {
    state.planComment = commentInput.value.trim();
  });

  versionSelect.addEventListener('change', () => {
    state.selectedVersionId = versionSelect.value ? Number(versionSelect.value) : null;
    loadAnalysis().then(renderAnalysis).catch(() => {});
    syncParamControls();
    updateRulesSummary();
  });

  ruleProfileSelect.addEventListener('change', () => {
    const value = ruleProfileSelect.value ? Number(ruleProfileSelect.value) : null;
    state.selectedRuleProfileId = Number.isNaN(value) ? null : value;
    applyRuleProfile();
    syncRuleControls();
    updateRulesSummary();
  });

  generateButton.addEventListener('click', async () => {
    if (state.generating) return;
    if (!state.selectedVersionId) {
      statusBar.set('Bitte zuerst eine Stundenverteilung auswählen.', true);
      return;
    }
    const name = planNameInput.value.trim();
    if (!name) {
      statusBar.set('Bitte einen Plan-Namen angeben.', true);
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

  rulesButton.addEventListener('click', () => {
    syncRuleControls();
    updateRulesSummary();
    openRulesModal();
  });

  rulesModalCloseButton.addEventListener('click', closeRulesModal);
  rulesModalElement.addEventListener('cancel', event => {
    event.preventDefault();
    closeRulesModal();
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
      state.subjects = new Map(subjects.map(sub => [sub.id, sub]));
      state.classes = new Map(classes.map(cls => [cls.id, cls]));
      state.teachers = new Map(teachers.map(t => [t.id, t]));

      planNameInput.value = state.planName;
      commentInput.value = state.planComment;
      renderVersionOptions();
      renderRuleProfiles();
      initializeRuleValues();
      renderRules();
      syncRuleControls();
      syncParamControls();
      renderResults();
      await loadAnalysis();
      renderAnalysis();
      statusBar.set('Daten geladen.');
      setTimeout(statusBar.clear, 1200);
    } catch (err) {
      statusBar.set(`Fehler beim Laden: ${formatError(err)}`, true);
    } finally {
      state.loading = false;
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
    if (!state.rulesDefinition) return;
    state.rulesDefinition.bools.forEach(rule => {
      state.ruleBaseBools.set(rule.key, !!rule.default);
      state.ruleValuesBools.set(rule.key, !!rule.default);
    });
    state.rulesDefinition.weights.forEach(rule => {
      state.ruleBaseWeights.set(rule.key, Number(rule.default));
      state.ruleValuesWeights.set(rule.key, Number(rule.default));
    });
  }

  function applyRuleProfile() {
    initializeRuleValues();
    if (!state.selectedRuleProfileId) {
      syncRuleControls();
      updateRulesSummary();
      return;
    }
    const profile = state.ruleProfiles.find(p => p.id === state.selectedRuleProfileId);
    if (!profile) {
      syncRuleControls();
      return;
    }
    if (state.rulesDefinition) {
      state.rulesDefinition.bools.forEach(rule => {
        if (profile[rule.key] !== undefined) {
          const value = !!profile[rule.key];
          state.ruleBaseBools.set(rule.key, value);
          state.ruleValuesBools.set(rule.key, value);
        }
      });
      state.rulesDefinition.weights.forEach(rule => {
        if (profile[rule.key] !== undefined) {
          const value = Number(profile[rule.key]);
          state.ruleBaseWeights.set(rule.key, value);
          state.ruleValuesWeights.set(rule.key, value);
        }
      });
    }
    updateRulesSummary();
  }

  function renderRules() {
    state.boolInputs.clear();
    state.weightInputs.clear();
    boolsContainer.innerHTML = '';
    weightsContainer.innerHTML = '';
    if (!state.rulesDefinition) return;

    state.rulesDefinition.bools.forEach(rule => {
      const row = document.createElement('label');
      row.className = 'flex items-center justify-between gap-3 p-3 rounded-lg border border-base-200 hover:border-base-300 transition';
      const info = document.createElement('div');
      info.className = 'flex flex-col';
      const title = document.createElement('span');
      title.className = 'font-medium text-sm';
      title.textContent = rule.label || rule.key;
      info.appendChild(title);
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.className = 'toggle toggle-primary';
      toggle.dataset.ruleKey = rule.key;
      toggle.addEventListener('change', () => {
        state.ruleValuesBools.set(rule.key, toggle.checked);
        updateRulesSummary();
      });
      row.append(info, toggle);
      boolsContainer.appendChild(row);
      state.boolInputs.set(rule.key, toggle);
    });

    state.rulesDefinition.weights.forEach(rule => {
      const wrap = document.createElement('div');
      wrap.className = 'space-y-2';
      const label = document.createElement('div');
      label.className = 'flex items-center justify-between text-sm font-medium';
      label.innerHTML = `<span>${rule.label || rule.key}</span><span data-weight-label="${rule.key}"></span>`;

      const range = document.createElement('input');
      range.type = 'range';
      range.className = 'range range-primary range-sm';
      range.min = rule.min ?? 0;
      range.max = rule.max ?? 50;
      range.step = 1;
      range.dataset.ruleKey = rule.key;

      const number = document.createElement('input');
      number.type = 'number';
      number.className = 'input input-sm input-bordered w-24';
      number.min = rule.min ?? 0;
      number.max = rule.max ?? 50;
      number.step = 1;
      number.dataset.ruleKey = rule.key;

      range.addEventListener('input', () => {
        const value = Number(range.value);
        state.ruleValuesWeights.set(rule.key, value);
        number.value = String(value);
        updateWeightLabel(rule.key, value);
        updateRulesSummary();
      });

      number.addEventListener('change', () => {
        let value = Number(number.value);
        if (Number.isNaN(value)) value = state.ruleValuesWeights.get(rule.key) || rule.default;
        value = Math.max(rule.min ?? 0, Math.min(rule.max ?? 50, value));
        state.ruleValuesWeights.set(rule.key, value);
        range.value = String(value);
        number.value = String(value);
        updateWeightLabel(rule.key, value);
        updateRulesSummary();
      });

      wrap.append(label, range, number);
      weightsContainer.appendChild(wrap);
      state.weightInputs.set(rule.key, { range, number });
    });

    syncRuleControls();
    loadAnalysis().then(renderAnalysis).catch(() => {});
    updateRulesSummary();
  }

  function syncRuleControls() {
    if (!state.rulesDefinition) return;
    state.rulesDefinition.bools.forEach(rule => {
      const value = state.ruleValuesBools.get(rule.key);
      const input = state.boolInputs.get(rule.key);
      if (input) {
        input.checked = !!value;
      }
    });
    state.rulesDefinition.weights.forEach(rule => {
      const value = state.ruleValuesWeights.get(rule.key);
      const entry = state.weightInputs.get(rule.key);
      if (entry) {
        entry.range.value = String(value ?? rule.default ?? 0);
        entry.number.value = String(value ?? rule.default ?? 0);
        updateWeightLabel(rule.key, value ?? rule.default ?? 0);
      }
    });
    syncParamControls();
  }

  function updateWeightLabel(key, value) {
    const label = weightsContainer.querySelector(`[data-weight-label="${key}"]`);
    if (label) label.textContent = `${value}`;
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
    statusBar.set('Berechne Plan…');
    try {
      state.planName = planNameInput.value.trim() || defaultPlanName();
      state.planComment = commentInput.value.trim();
      planNameInput.value = state.planName;
      commentInput.value = state.planComment;
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
      };
      state.generatedPlans.unshift(planEntry);
      state.generatedPlans = state.generatedPlans.slice(0, 5);
      state.lastPlanId = planEntry.id;
      saveButton.disabled = false;
      renderResults();
      updateRulesSummary();
      await loadAnalysis();
      if (state.activeTab === 'analysis') {
        renderAnalysis();
      }
      statusBar.set('Plan berechnet.');
      setTimeout(statusBar.clear, 1500);
    } catch (err) {
      statusBar.set(`Planberechnung fehlgeschlagen: ${formatError(err)}`, true);
    } finally {
      state.generating = false;
      generateButton.disabled = false;
    }
  }

  async function handleSave(name, comment) {
    try {
      await updatePlan(state.lastPlanId, { name, comment });
      state.planName = name;
      state.planComment = comment;
      planNameInput.value = name;
      commentInput.value = comment;
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

  function buildOverrides() {
    const overrides = {};
    state.ruleValuesBools.forEach((value, key) => {
      const base = state.ruleBaseBools.get(key);
      if (base === undefined || base !== value) {
        overrides[key] = value;
      }
    });
    state.ruleValuesWeights.forEach((value, key) => {
      const base = state.ruleBaseWeights.get(key);
      if (base === undefined || base !== value) {
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
    if (!state.generatedPlans.length) {
      const empty = document.createElement('div');
      empty.className = 'alert alert-info';
      empty.textContent = 'Noch kein Plan berechnet.';
      resultsSection.appendChild(empty);
      return;
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

      body.appendChild(renderPlanMatrix(entry.slots));

      card.appendChild(body);
      resultsSection.appendChild(card);
    });
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

  function createRulesModal() {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal';

    const box = document.createElement('div');
    box.className = 'modal-box max-w-3xl space-y-4';

    const headerRow = document.createElement('div');
    headerRow.className = 'flex items-center justify-between gap-3';
    const title = document.createElement('h3');
    title.className = 'font-semibold text-lg';
    title.textContent = 'Regelkonfiguration';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'btn btn-sm btn-circle btn-ghost';
    closeButton.textContent = '✕';
    headerRow.append(title, closeButton);

    const boolsHeading = document.createElement('h4');
    boolsHeading.className = 'text-sm font-semibold uppercase opacity-60';
    boolsHeading.textContent = 'Regeln';

    const boolsContainer = document.createElement('div');
    boolsContainer.className = 'space-y-3';

    const weightsHeading = document.createElement('h4');
    weightsHeading.className = 'text-sm font-semibold uppercase opacity-60';
    weightsHeading.textContent = 'Gewichtungen';

    const weightsContainer = document.createElement('div');
    weightsContainer.className = 'space-y-4';

    const hint = document.createElement('p');
    hint.className = 'text-xs opacity-60';
    hint.textContent = 'Änderungen gelten nur für die nächste Planberechnung.';

    box.append(headerRow, boolsHeading, boolsContainer, weightsHeading, weightsContainer, hint);

    const backdrop = document.createElement('form');
    backdrop.method = 'dialog';
    backdrop.className = 'modal-backdrop';
    const backdropBtn = document.createElement('button');
    backdropBtn.textContent = 'Schließen';
    backdrop.appendChild(backdropBtn);

    dialog.append(box, backdrop);

    return {
      element: dialog,
      boolsContainer,
      weightsContainer,
      closeButton,
      open() {
        dialog.showModal();
      },
      close() {
        dialog.close();
      },
    };
  }

  tabs.onChange(id => {
    state.activeTab = id;
    renderResults();
    renderAnalysis();
  });

  function createParamsAccordion() {
    const wrap = document.createElement('details');
    wrap.className = 'collapse bg-base-200/60';

    const summary = document.createElement('summary');
    summary.className = 'collapse-title text-sm font-medium cursor-pointer';
    summary.textContent = 'Solver-Parameter';

    const content = document.createElement('div');
    content.className = 'collapse-content space-y-4';

    content.appendChild(createParamRowCheckbox('Mehrfach-Start', 'Mehrere Startläufe mit unterschiedlichen Seeds', 'multi_start'));
    content.appendChild(createParamRowNumber('Max. Versuche', 'Anzahl Startläufe (nur bei Mehrfach-Start)', 'max_attempts', { min: 1, max: 100, step: 1 }));
    content.appendChild(createParamRowNumber('Geduld', 'Abbruch nach so vielen erfolglosen Läufen', 'patience', { min: 1, max: 20, step: 1 }));
    content.appendChild(createParamRowNumber('Zeit pro Versuch (s)', 'Maximale Solver-Zeit pro Versuch', 'time_per_attempt', { min: 1, max: 600, step: 0.5 }));
    content.appendChild(createParamRowCheckbox('Zufallssuche', 'Zufallsheuristiken aktivieren', 'randomize_search'));
    content.appendChild(createParamRowNumber('Basis-Seed', 'Startwert für Zufallszahlen', 'base_seed', { step: 1 }));
    content.appendChild(createParamRowNumber('Seed-Schritt', 'Offset für weitere Versuche', 'seed_step', { step: 1 }));
    content.appendChild(createParamRowCheckbox('Value Hints', 'Startwerte für Slots vorgeben', 'use_value_hints'));

    wrap.append(summary, content);
    syncParamControls();
    return wrap;
  }

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
    });
    row.append(heading, sub, input);
    state.paramInputs.set(key, { type: 'number', element: input });
    return row;
  }

  function renderPlanMatrix(slots) {
    const wrapper = document.createElement('div');
    wrapper.className = 'space-y-4';
    const grouped = new Map();
    slots.forEach(slot => {
      const classGroup = grouped.get(slot.class_id) || new Map();
      const tagMap = classGroup.get(slot.tag) || new Map();
      tagMap.set(slot.stunde, slot);
      classGroup.set(slot.tag, tagMap);
      grouped.set(slot.class_id, classGroup);
    });

    const classIds = Array.from(grouped.keys()).sort((a, b) => {
      const classA = state.classes.get(a)?.name || '';
      const classB = state.classes.get(b)?.name || '';
      return classA.localeCompare(classB);
    });

    classIds.forEach(classId => {
      const classCard = document.createElement('div');
      classCard.className = 'space-y-2';
      const heading = document.createElement('h4');
      heading.className = 'font-semibold text-sm';
      heading.textContent = state.classes.get(classId)?.name || `Klasse #${classId}`;
      classCard.appendChild(heading);

      const table = document.createElement('table');
      table.className = 'table table-compact w-full';
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      const emptyCell = document.createElement('th');
      emptyCell.textContent = 'Std';
      headRow.appendChild(emptyCell);
      DAYS.forEach(day => {
        const th = document.createElement('th');
        th.textContent = day;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      const classMap = grouped.get(classId) || new Map();
      STUNDEN.forEach(stunde => {
        const row = document.createElement('tr');
        const labelCell = document.createElement('td');
        labelCell.className = 'font-semibold text-xs opacity-70';
        labelCell.textContent = `${stunde}.`;
        row.appendChild(labelCell);
        DAYS.forEach(day => {
          const cell = document.createElement('td');
          cell.className = 'text-xs align-top';
          const slot = classMap.get(day)?.get(stunde);
          if (slot) {
            const subject = state.subjects.get(slot.subject_id);
            const teacher = state.teachers.get(slot.teacher_id);
            cell.innerHTML = `
              <div class="font-medium">${subject?.kuerzel || subject?.name || `Fach #${slot.subject_id}`}</div>
              <div class="opacity-70">${teacher?.kuerzel || teacher?.name || ''}</div>
            `;
          } else {
            cell.innerHTML = '<span class="opacity-30">—</span>';
          }
          row.appendChild(cell);
        });
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      classCard.appendChild(table);
      wrapper.appendChild(classCard);
    });

    if (!classIds.length) {
      const info = document.createElement('p');
      info.className = 'text-sm opacity-70';
      info.textContent = 'Keine belegten Slots vorhanden.';
      wrapper.appendChild(info);
    }

    return wrapper;
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

function createButtonRow(buttons) {
  const wrap = document.createElement('div');
  wrap.className = 'flex flex-wrap items-center gap-3';
  buttons.forEach(btn => wrap.appendChild(btn));
  return wrap;
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
