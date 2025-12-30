import { fetchTeachers, updateTeacher, createTeacher, deleteTeacher } from '../api/teachers.js';
import { fetchClasses, createClass, updateClass, deleteClass } from '../api/classes.js';
import { fetchRooms, createRoom, updateRoom, deleteRoom } from '../api/rooms.js';
import { fetchSubjects, createSubject, updateSubject, deleteSubject } from '../api/subjects.js';
import { fetchCurriculum, createCurriculum, updateCurriculum, deleteCurriculum } from '../api/curriculum.js';
import { confirmModal, formatError, formModal } from '../utils/ui.js';
import { createTeacherBadge, updateTeacherBadge, DEFAULT_TEACHER_BADGE_COLOR } from '../components/TeacherBadge.js';
import { createIcon, ICONS } from '../components/icons.js';
import { pickNextTeacherColor, normalizeTeacherColor } from '../constants/teacherColors.js';
import {
  ensurePlanningPeriodsLoaded,
  subscribePlanningPeriods,
  setActivePlanningPeriodId,
  getActivePlanningPeriodId,
  createPlanningPeriod,
  updatePlanningPeriod,
  deletePlanningPeriod,
  clonePlanningPeriod,
} from '../store/planningPeriods.js';

const SUBJECT_DOPPEL_OPTIONS = [
  { value: '', label: 'Keine Vorgabe' },
  { value: 'muss', label: 'Doppelstunde muss' },
  { value: 'soll', label: 'Doppelstunde bevorzugt' },
  { value: 'kann', label: 'Doppelstunde kann' },
  { value: 'nein', label: 'Keine Doppelstunde' },
];

const SUBJECT_NACHMITTAG_OPTIONS = [
  { value: '', label: 'Keine Vorgabe' },
  { value: 'muss', label: 'Nachmittag muss' },
  { value: 'kann', label: 'Nachmittag kann' },
  { value: 'nein', label: 'Kein Nachmittag' },
];

const CURRICULUM_PARTICIPATION_OPTIONS = [
  { value: 'curriculum', label: 'Pflicht (Curriculum)' },
  { value: 'ag', label: 'Freiwillig (AG/Förder)' },
];

const CURRICULUM_DOPPEL_OPTIONS = [
  { value: '', label: 'Vererbt (Fach-Standard)' },
  { value: 'muss', label: 'Doppelstunde muss' },
  { value: 'soll', label: 'Doppelstunde bevorzugt' },
  { value: 'kann', label: 'Doppelstunde kann' },
  { value: 'nein', label: 'Keine Doppelstunde' },
];

const CURRICULUM_NACHMITTAG_OPTIONS = [
  { value: '', label: 'Vererbt (Fach-Standard)' },
  { value: 'muss', label: 'Nachmittag muss' },
  { value: 'kann', label: 'Nachmittag kann' },
  { value: 'nein', label: 'Kein Nachmittag' },
];

const BUTTON_SIZES = {
  xs: 'px-2.5 py-1 text-xs',
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

const BUTTON_VARIANTS = {
  primary: 'bg-blue-600 text-white hover:bg-blue-500 focus:ring-blue-500',
  secondary: 'bg-gray-900 text-white hover:bg-gray-800 focus:ring-gray-900',
  outline: 'border border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 focus:ring-blue-500',
  ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 focus:ring-blue-500',
  subtle: 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-300',
  danger: 'bg-red-600 text-white hover:bg-red-500 focus:ring-red-500',
};

function buttonClass(variant = 'primary', size = 'md') {
  const sizeClass = BUTTON_SIZES[size] || BUTTON_SIZES.md;
  const variantClass = BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary;
  return [
    'inline-flex items-center justify-center rounded-lg font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed',
    sizeClass,
    variantClass,
  ].join(' ');
}

const INPUT_SIZES = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3 py-2 text-sm',
  lg: 'px-3.5 py-2.5 text-base',
};

function inputClass(size = 'md') {
  const sizeClass = INPUT_SIZES[size] || INPUT_SIZES.md;
  return [
    'w-full rounded-lg border border-gray-200 bg-white text-gray-900 shadow-sm placeholder-gray-400',
    sizeClass,
    'focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 focus:outline-none transition',
  ].join(' ');
}

function selectClass(size = 'md') {
  return `${inputClass(size)} pr-8`;
}

function textareaClass(size = 'md') {
  return `${inputClass(size)} resize-y`;
}

function checkboxClass() {
  return 'h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-0';
}

const TABLE_WRAPPER_CLASS = 'overflow-x-auto border border-gray-200 rounded-2xl bg-white shadow-sm';
const TABLE_CLASS = 'min-w-full divide-y divide-gray-200 text-sm text-gray-700';
const TABLE_HEAD_ROW_CLASS = 'bg-gray-50';
const TABLE_HEAD_CELL_CLASS = 'px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500';
const TABLE_ROW_CLASS = 'border-b border-gray-100 transition hover:bg-gray-50';
const TABLE_CELL_CLASS = 'px-5 py-3.5 align-middle';

export function createDataMaintenanceView(initialTab = null) {
  const container = document.createElement('section');
  container.className = 'space-y-6';

  const header = document.createElement('div');
  header.className = 'space-y-2';
  header.innerHTML = `
    <div class="space-y-1">
      <p class="text-sm text-blue-600 font-semibold">Stammdaten</p>
      <h1 class="text-2xl font-semibold text-gray-900">Datenpflege</h1>
      <p class="text-sm text-gray-600">Verwalte Lehrkräfte, Klassen, Fächer, Räume und Planungsperioden zentral.</p>
    </div>
  `;
  container.appendChild(header);

  const entries = [
    { id: 'teachers', label: 'Lehrkräfte', icon: ICONS.USERS },
    { id: 'classes', label: 'Klassen', icon: ICONS.LAYERS },
    { id: 'subjects', label: 'Fächer', icon: ICONS.BOOK_OPEN },
    { id: 'rooms', label: 'Räume', icon: ICONS.BUILDING },
    { id: 'curriculum', label: 'Stundentafel', icon: ICONS.TABLE },
    { id: 'periods', label: 'Planungsperioden', icon: ICONS.CALENDAR },
  ];

  const tabBar = document.createElement('div');
  tabBar.className = 'flex flex-wrap items-center gap-2';

  const tabButtons = new Map();

  entries.forEach(entry => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.entry = entry.id;
    button.setAttribute('aria-label', entry.label);
    button.className = tabButtonClass(false);
    button.addEventListener('click', () => switchSection(entry.id));

    const buttonContent = document.createElement('div');
    buttonContent.className = 'flex items-center gap-3';

    const iconWrap = document.createElement('div');
    iconWrap.className = tabIconClass(false);
    const iconNode = createIcon(entry.icon, { size: 18 });
    iconNode.style.width = '18px';
    iconNode.style.height = '18px';
    iconNode.setAttribute('aria-hidden', 'true');
    iconWrap.appendChild(iconNode);

    const labelWrap = document.createElement('div');
    labelWrap.className = 'flex items-center gap-2';
    const labelNode = document.createElement('span');
    labelNode.className = 'text-sm font-medium text-gray-600';
    labelNode.textContent = entry.label;
    const countNode = document.createElement('span');
    countNode.className = 'rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600';
    countNode.textContent = '0';

    labelWrap.append(labelNode, countNode);
    buttonContent.append(iconWrap, labelWrap);
    button.appendChild(buttonContent);

    tabButtons.set(entry.id, { button, iconWrap, labelNode, countNode });
    tabBar.appendChild(button);
  });

  container.appendChild(tabBar);

  let activeSection = null;
  const sectionWrap = document.createElement('div');
  sectionWrap.id = 'maintenance-section';
  sectionWrap.className = 'space-y-4';
  container.appendChild(sectionWrap);

  function tabButtonClass(active) {
    const base = 'group flex items-center gap-3 rounded-xl border px-3.5 py-2 transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1';
    if (active) {
      return `${base} border-blue-200 bg-blue-50 text-blue-700 shadow-sm`;
    }
    return `${base} border-transparent bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700`;
  }

  function tabIconClass(active) {
    const base = 'flex h-9 w-9 items-center justify-center rounded-lg border transition-colors';
    if (active) {
      return `${base} border-blue-200 bg-blue-100 text-blue-700 shadow-sm`;
    }
    return `${base} border-gray-200 bg-white text-gray-500 group-hover:border-blue-200 group-hover:bg-blue-50 group-hover:text-blue-700`;
  }

  function applyActiveTab(id) {
    tabButtons.forEach((info, tabId) => {
      const isActive = tabId === id;
      info.button.className = tabButtonClass(isActive);
      info.iconWrap.className = tabIconClass(isActive);
      info.labelNode.className = isActive
        ? 'text-sm font-semibold text-blue-700'
        : 'text-sm font-medium text-gray-600 group-hover:text-blue-700';
      info.countNode.className = isActive
        ? 'rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700'
        : 'rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600';
    });
  }

  function updateTabBadge(id, value) {
    const info = tabButtons.get(id);
    if (!info) return;
    info.countNode.textContent = value != null ? String(value) : '0';
  }

  function switchSection(id) {
    applyActiveTab(id);
    try {
      localStorage.setItem('maintenance-active-tab', id);
    } catch {
      // ignore storage issues
    }
    if (activeSection?.destroy) activeSection.destroy();
    sectionWrap.innerHTML = '';

    const context = {
      updateTabMetric(value) {
        updateTabBadge(id, value ?? 0);
      },
    };

    if (id === 'teachers') activeSection = createTeachersSection(context);
    if (id === 'classes') activeSection = createClassesSection(context);
    if (id === 'subjects') activeSection = createSubjectsSection(context);
    if (id === 'rooms') activeSection = createRoomsSection(context);
    if (id === 'curriculum') activeSection = createCurriculumSection(context);
    if (id === 'periods') activeSection = createPlanningPeriodsSection(context);

    if (activeSection?.element) sectionWrap.appendChild(activeSection.element);
  }

  function preferredTab() {
    if (initialTab) return initialTab;
    const hash = window.location.hash || '';
    const queryIndex = hash.indexOf('?');
    if (queryIndex !== -1) {
      const query = hash.substring(queryIndex + 1);
      const params = new URLSearchParams(query);
      const tabParam = params.get('tab');
      if (tabParam && entries.some(entry => entry.id === tabParam)) {
        return tabParam;
      }
    }
    try {
      const stored = localStorage.getItem('maintenance-active-tab');
      if (entries.some(entry => entry.id === stored)) {
        return stored;
      }
    } catch {
      // ignore read errors
    }
    return 'teachers';
  }

  switchSection(preferredTab());
  return container;
}

export function createPlanningPeriodsView() {
  return createDataMaintenanceView('periods');
}

export function createTeachersView() {
  return createDataMaintenanceView('teachers');
}

export function createClassesView() {
  return createDataMaintenanceView('classes');
}

export function createSubjectsView() {
  return createDataMaintenanceView('subjects');
}

export function createRoomsView() {
  return createDataMaintenanceView('rooms');
}

export function createCurriculumView() {
  return createDataMaintenanceView('curriculum');
}

function createPlanningPeriodsSection(context = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'space-y-4';

  const intro = document.createElement('div');
  intro.className = 'space-y-1';
  intro.innerHTML = `
    <h2 class="text-xl font-semibold">Planungsperioden verwalten</h2>
    <p class="text-sm opacity-70">Organisiere Schuljahre oder Planungsphasen, setze die aktive Periode und klone bestehende Datenbestände.</p>
  `;

  const toolbar = document.createElement('div');
  toolbar.className = 'flex flex-wrap items-center justify-between gap-3';

  const infoText = document.createElement('span');
  infoText.className = 'text-sm opacity-70';
  infoText.textContent = 'Die ausgewählte Planungsperiode bestimmt, welche Daten in den Ansichten geladen werden.';

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = `${buttonClass('primary', 'sm')} gap-2`;
  const addPeriodIcon = createIcon(ICONS.PLUS, { size: 14 });
  addPeriodIcon.style.width = '14px';
  addPeriodIcon.style.height = '14px';
  addButton.append(addPeriodIcon, document.createTextNode('Neue Periode anlegen'));

  toolbar.append(infoText, addButton);

  const statusBar = createStatusBar();
  const table = createTable(['Name', 'Start', 'Ende', 'Status', 'Aktionen']);

  wrap.append(intro, toolbar, table.wrapper);

  const state = {
    loading: true,
    periods: [],
    activeId: getActivePlanningPeriodId(),
  };

  const unsubscribe = subscribePlanningPeriods(({ periods, activeId }) => {
    state.periods = periods;
    state.activeId = activeId;
    state.loading = false;
    renderTable();
  });

  ensurePlanningPeriodsLoaded()
    .catch(err => {
      statusBar.set(`Planungsperioden konnten nicht geladen werden: ${formatError(err)}`, true);
      state.loading = false;
      renderTable();
    });

  addButton.addEventListener('click', async () => {
    const result = await formModal({
      title: 'Neue Planungsperiode',
      message: 'Lege Name und Zeitraum der neuen Periode fest.',
      confirmText: 'Anlegen',
      fields: [
        { name: 'name', label: 'Name*', required: true, maxLength: 120 },
        { name: 'start_date', label: 'Startdatum', type: 'date' },
        { name: 'end_date', label: 'Enddatum', type: 'date' },
        {
          name: 'is_active',
          label: 'Sofort aktiv setzen',
          type: 'select',
          options: [
            { value: 'false', label: 'Nein' },
            { value: 'true', label: 'Ja' },
          ],
          value: 'false',
        },
      ],
      validate(values) {
        if (!values.name) return 'Bitte einen Namen angeben.';
        return null;
      },
    });
    if (!result) return;
    const payload = { name: result.name.trim() };
    if (result.start_date) payload.start_date = result.start_date;
    if (result.end_date) payload.end_date = result.end_date;
    if (result.is_active) payload.is_active = result.is_active === 'true';
    try {
      statusBar.set('Lege Planungsperiode an…');
      const created = await createPlanningPeriod(payload);
      if (payload.is_active && created?.id != null) {
        setActivePlanningPeriodId(created.id);
      }
      statusBar.set('Planungsperiode wurde angelegt.');
    } catch (err) {
      statusBar.set(formatError(err), true);
    }
  });

  function renderTable() {
    table.tbody.innerHTML = '';
    if (state.loading) {
      appendMessageRow('Lade Planungsperioden…');
      return;
    }
    if (!state.periods.length) {
      appendMessageRow('Keine Planungsperioden vorhanden.');
      return;
    }
    state.periods.forEach(period => {
      const tr = document.createElement('tr');
      tr.className = TABLE_ROW_CLASS;

      const nameTd = document.createElement('td');
      nameTd.className = TABLE_CELL_CLASS;
      nameTd.textContent = period.name;
      tr.appendChild(nameTd);

      const startTd = document.createElement('td');
      startTd.className = TABLE_CELL_CLASS;
      startTd.textContent = formatDate(period.start_date);
      tr.appendChild(startTd);

      const endTd = document.createElement('td');
      endTd.className = TABLE_CELL_CLASS;
      endTd.textContent = formatDate(period.end_date);
      tr.appendChild(endTd);

      const statusTd = document.createElement('td');
      statusTd.className = TABLE_CELL_CLASS;
      const statusWrap = document.createElement('div');
      statusWrap.className = 'flex flex-wrap gap-2';
      const badges = [];
      if (period.is_active) badges.push(createBadge('Aktiv', 'success'));
      if (!period.is_active) badges.push(createBadge('Inaktiv', 'muted'));
      if (period.id === state.activeId) badges.push(createBadge('Ausgewählt', 'primary'));
      if (!badges.length) badges.push(createBadge('—', 'muted'));
      badges.forEach(badge => statusWrap.appendChild(badge));
      statusTd.appendChild(statusWrap);
      tr.appendChild(statusTd);

      const actionsTd = document.createElement('td');
      actionsTd.className = TABLE_CELL_CLASS;
      const actionsWrap = document.createElement('div');
      actionsWrap.className = 'flex flex-wrap items-center gap-2';

      if (!period.is_active) {
        const activateBtn = document.createElement('button');
        activateBtn.type = 'button';
        activateBtn.className = `${buttonClass('outline', 'xs')} whitespace-nowrap`;
        activateBtn.textContent = 'Aktiv setzen';
        activateBtn.addEventListener('click', async () => {
          try {
            statusBar.set('Aktiviere Planungsperiode…');
            await updatePlanningPeriod(period.id, { is_active: true });
            setActivePlanningPeriodId(period.id);
            statusBar.set('Planungsperiode ist nun aktiv.');
          } catch (err) {
            statusBar.set(formatError(err), true);
          }
        });
        actionsWrap.appendChild(activateBtn);
      }

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = `${buttonClass('outline', 'xs')} whitespace-nowrap`;
      editBtn.textContent = 'Bearbeiten';
      editBtn.addEventListener('click', () => openEditModal(period));
      actionsWrap.appendChild(editBtn);

      const cloneBtn = document.createElement('button');
      cloneBtn.type = 'button';
      cloneBtn.className = `${buttonClass('ghost', 'xs')} whitespace-nowrap`;
      cloneBtn.textContent = 'Klonen';
      cloneBtn.addEventListener('click', () => openCloneModal(period));
      actionsWrap.appendChild(cloneBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = `${buttonClass('outline', 'xs')} text-red-600 hover:text-red-700 border-red-200 hover:border-red-400 focus:ring-red-500/40 whitespace-nowrap`;
      deleteBtn.textContent = 'Löschen';
      deleteBtn.addEventListener('click', () => confirmDelete(period));
      actionsWrap.appendChild(deleteBtn);

      actionsTd.appendChild(actionsWrap);
      tr.appendChild(actionsTd);
      table.tbody.appendChild(tr);
    });
  }

  function appendMessageRow(message) {
    const row = document.createElement('tr');
    row.className = TABLE_ROW_CLASS;
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = `${TABLE_CELL_CLASS} text-center text-sm text-gray-500 py-6`;
    cell.textContent = message;
    row.appendChild(cell);
    table.tbody.appendChild(row);
  }

  function createBadge(text, tone = 'muted') {
    const palette = {
      success: 'bg-green-100 text-green-700',
      primary: 'bg-blue-100 text-blue-700',
      muted: 'bg-gray-100 text-gray-600',
    };
    const span = document.createElement('span');
    span.className = `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${palette[tone] || palette.muted}`;
    span.textContent = text;
    return span;
  }

  function formatDate(value) {
    if (!value) return '—';
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleDateString();
    } catch {
      return String(value);
    }
  }

  async function openEditModal(period) {
    const result = await formModal({
      title: `Planungsperiode „${period.name}” bearbeiten`,
      confirmText: 'Speichern',
      fields: [
        { name: 'name', label: 'Name*', required: true, value: period.name, maxLength: 120 },
        { name: 'start_date', label: 'Startdatum', type: 'date', value: period.start_date || '' },
        { name: 'end_date', label: 'Enddatum', type: 'date', value: period.end_date || '' },
        {
          name: 'is_active',
          label: 'Aktiv',
          type: 'select',
          options: [
            { value: 'false', label: 'Nein' },
            { value: 'true', label: 'Ja' },
          ],
          value: period.is_active ? 'true' : 'false',
        },
      ],
      validate(values) {
        if (!values.name) return 'Bitte einen Namen angeben.';
        return null;
      },
    });
    if (!result) return;
    const payload = { name: result.name.trim() };
    payload.start_date = result.start_date || null;
    payload.end_date = result.end_date || null;
    payload.is_active = result.is_active === 'true';
    try {
      statusBar.set('Speichere Planungsperiode…');
      await updatePlanningPeriod(period.id, payload);
      if (payload.is_active) {
        setActivePlanningPeriodId(period.id);
      } else if (period.id === state.activeId && !payload.is_active) {
        setActivePlanningPeriodId(null);
      }
      statusBar.set('Änderungen gespeichert.');
    } catch (err) {
      statusBar.set(formatError(err), true);
    }
  }

  async function openCloneModal(period) {
    const result = await formModal({
      title: `Planungsperiode „${period.name}” klonen`,
      message: 'Die neue Periode enthält Kopien von Stundentafel, Requirements, Versionen und Basisplan.',
      confirmText: 'Klonen',
      fields: [
        { name: 'name', label: 'Name der neuen Periode*', required: true, value: `${period.name} (Kopie)`, maxLength: 120 },
        { name: 'start_date', label: 'Startdatum', type: 'date', value: period.start_date || '' },
        { name: 'end_date', label: 'Enddatum', type: 'date', value: period.end_date || '' },
        {
          name: 'is_active',
          label: 'Sofort aktiv setzen',
          type: 'select',
          options: [
            { value: 'false', label: 'Nein' },
            { value: 'true', label: 'Ja' },
          ],
          value: 'false',
        },
      ],
      validate(values) {
        if (!values.name) return 'Bitte einen Namen angeben.';
        return null;
      },
    });
    if (!result) return;
    const payload = {
      name: result.name.trim(),
      start_date: result.start_date || null,
      end_date: result.end_date || null,
      is_active: result.is_active === 'true',
    };
    try {
      statusBar.set('Kopiere Planungsperiode…');
      const clone = await clonePlanningPeriod(period.id, payload);
      if (payload.is_active && clone?.id != null) {
        setActivePlanningPeriodId(clone.id);
      }
      statusBar.set('Planungsperiode wurde geklont.');
    } catch (err) {
      statusBar.set(formatError(err), true);
    }
  }

  async function confirmDelete(period) {
    const ok = await confirmModal({
      title: 'Planungsperiode löschen?',
      message: `Soll die Planungsperiode „${period.name}” wirklich gelöscht werden?` +
        ' Abhängige Daten müssen zuvor entfernt werden.',
      confirmText: 'Löschen',
      cancelText: 'Abbrechen',
    });
    if (!ok) return;
    try {
      statusBar.set('Lösche Planungsperiode…');
      await deletePlanningPeriod(period.id);
      const snapshot = getActivePlanningPeriodId();
      if (snapshot != null) {
        setActivePlanningPeriodId(snapshot);
      }
      statusBar.set('Planungsperiode gelöscht.');
    } catch (err) {
      statusBar.set(formatError(err), true);
    }
  }

  return {
    element: wrap,
    destroy() {
      unsubscribe();
      statusBar.destroy();
    },
  };
}

// --- Lehrer ---
function createTeachersSection(context = {}) {
  const { updateTabMetric } = context || {};
  const wrap = document.createElement('div');
  wrap.className = 'space-y-4';

  const status = createStatusBar();

  const controls = document.createElement('div');
  controls.className = 'flex flex-wrap items-center justify-between gap-3';

  const controlLeft = document.createElement('div');
  controlLeft.className = 'flex flex-wrap items-center gap-2';

  const searchWrap = document.createElement('div');
  searchWrap.className = 'relative flex-1 min-w-[220px] sm:flex-initial sm:max-w-xs';
  const searchIcon = createIcon(ICONS.SEARCH, { size: 16 });
  searchIcon.style.width = '16px';
  searchIcon.style.height = '16px';
  searchIcon.classList.add('absolute', 'left-3', 'top-1/2', '-translate-y-1/2', 'text-gray-400', 'pointer-events-none');
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Lehrkräfte durchsuchen…';
  searchInput.className = `${inputClass('md')} pl-9`;
  searchWrap.append(searchIcon, searchInput);
  controlLeft.appendChild(searchWrap);

  const filterButton = document.createElement('button');
  filterButton.type = 'button';
  filterButton.className = `${buttonClass('outline', 'sm')} gap-2`;
  const filterIcon = createIcon(ICONS.FILTER, { size: 14 });
  filterIcon.style.width = '14px';
  filterIcon.style.height = '14px';
  filterButton.append(filterIcon, document.createTextNode('Filter'));
  filterButton.addEventListener('click', () => {
    setStatus('Filterfunktionen folgen in Kürze.');
  });
  controlLeft.appendChild(filterButton);

  const controlRight = document.createElement('div');
  controlRight.className = 'flex items-center gap-2';
  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = `${buttonClass('primary', 'md')} gap-2`;
  const addIcon = createIcon(ICONS.PLUS, { size: 16 });
  addIcon.style.width = '16px';
  addIcon.style.height = '16px';
  addButton.append(addIcon, document.createTextNode('Neu hinzufügen'));
  controlRight.appendChild(addButton);

  controls.append(controlLeft, controlRight);
  wrap.appendChild(controls);

  const table = createTable([
    'Badge',
    'Vorname',
    'Nachname',
    'Kürzel*',
    'Farbe',
    'Wochenstunden*',
    'Deputat',
    'Mo',
    'Di',
    'Mi',
    'Do',
    'Fr',
    'Aktion',
  ]);
  wrap.appendChild(table.wrapper);

  const summary = document.createElement('div');
  summary.className = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4';
  wrap.appendChild(summary);

  const state = {
    teachers: [],
    searchTerm: '',
    draftRow: null,
  };

  const setStatus = status.set;
  const clearStatus = status.clear;

  searchInput.addEventListener('input', () => {
    state.searchTerm = searchInput.value.trim().toLowerCase();
    renderRows();
  });

  addButton.addEventListener('click', () => {
    if (state.draftRow?.focus) {
      state.draftRow.focus();
      return;
    }
    const draft = table.tbody.querySelector('[data-new-teacher-row="true"]');
    if (draft) {
      draft.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const input = draft.querySelector('input');
      if (input) input.focus();
    }
  });

  async function loadTeachers() {
    setStatus('Lade Lehrkräfte…');
    try {
      const data = await fetchTeachers();
      state.teachers = data;
      if (typeof updateTabMetric === 'function') {
        updateTabMetric(data.length);
      }
      renderRows();
      renderSummary();
      setStatus(`${data.length} Lehrkräfte geladen.`);
      setTimeout(clearStatus, 2000);
    } catch (err) {
      setStatus(`Fehler beim Laden: ${formatError(err)}`, true);
    }
  }

  function renderRows() {
    table.tbody.innerHTML = '';
    const filtered = state.teachers.filter(teacher => {
      if (!state.searchTerm) return true;
      const haystack = [
        teacher.first_name ?? '',
        teacher.last_name ?? '',
        teacher.kuerzel ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(state.searchTerm);
    });

    filtered.forEach(teacher => {
      const tr = document.createElement('tr');
      tr.className = TABLE_ROW_CLASS;
      const badgeInfo = teacherBadgeCell(teacher);
      const isPoolTeacher = (teacher.kuerzel || '').trim().toLowerCase() === 'pool';
      const localTeacher = { ...teacher };
      if (isPoolTeacher) {
        tr.classList.add('bg-gray-50', 'opacity-80');
      }
      tr.append(
        badgeInfo.cell,
        teacherInputCell(teacher, 'first_name', setStatus, clearStatus, 'text', renderRows, undefined, { placeholder: 'Vorname' }),
        teacherInputCell(teacher, 'last_name', setStatus, clearStatus, 'text', renderRows, undefined, { placeholder: 'Nachname' }),
        teacherInputCell(
          teacher,
          'kuerzel',
          setStatus,
          clearStatus,
          'text',
          renderRows,
          newValue => {
            localTeacher.kuerzel = newValue;
            badgeInfo.update(localTeacher);
          },
          { disabled: isPoolTeacher, placeholder: 'Kürzel' },
        ),
        teacherColorCell(
          teacher,
          setStatus,
          clearStatus,
          renderRows,
          value => {
            const normalized = value ? normalizeColorValue(value) : teacher.color;
            localTeacher.color = normalized;
            badgeInfo.update(localTeacher);
          },
          { disabled: isPoolTeacher },
        ),
        teacherInputCell(
          teacher,
          'deputat_soll',
          setStatus,
          clearStatus,
          'number',
          renderRows,
          undefined,
          { disabled: isPoolTeacher, min: 0, placeholder: 'Wochenstunden' },
        ),
        teacherInputCell(
          teacher,
          'deputat',
          setStatus,
          clearStatus,
          'number',
          renderRows,
          undefined,
          { disabled: isPoolTeacher, min: 0, placeholder: 'Deputat' },
        ),
        teacherCheckboxCell(teacher, 'work_mo', setStatus, clearStatus, renderRows),
        teacherCheckboxCell(teacher, 'work_di', setStatus, clearStatus, renderRows),
        teacherCheckboxCell(teacher, 'work_mi', setStatus, clearStatus, renderRows),
        teacherCheckboxCell(teacher, 'work_do', setStatus, clearStatus, renderRows),
        teacherCheckboxCell(teacher, 'work_fr', setStatus, clearStatus, renderRows),
        teacherActionCell(teacher, loadTeachers, setStatus, clearStatus)
      );
      table.tbody.appendChild(tr);
    });

    if (!filtered.length) {
      const emptyRow = document.createElement('tr');
      emptyRow.className = TABLE_ROW_CLASS;
      const emptyCell = document.createElement('td');
      emptyCell.colSpan = 13;
      emptyCell.className = `${TABLE_CELL_CLASS} text-center text-sm text-gray-500`;
      emptyCell.textContent = state.searchTerm
        ? 'Keine Lehrkräfte passend zur Suche.'
        : 'Noch keine Lehrkräfte erfasst.';
      emptyRow.appendChild(emptyCell);
      table.tbody.appendChild(emptyRow);
    }

    const draftRow = newTeacherRow(loadTeachers, setStatus, clearStatus, state.teachers);
    draftRow.row.dataset.newTeacherRow = 'true';
    table.tbody.appendChild(draftRow.row);
    state.draftRow = draftRow;
    renderSummary();
  }

  function renderSummary() {
    const totalTeachers = state.teachers.length;
    const totalSoll = state.teachers.reduce((sum, teacher) => sum + (Number(teacher.deputat_soll) || 0), 0);
    const totalIst = state.teachers.reduce((sum, teacher) => sum + (Number(teacher.deputat) || 0), 0);
    const fullTime = state.teachers.filter(teacher => {
      const target = Number(teacher.deputat_soll ?? teacher.deputat ?? 0);
      return Number.isFinite(target) && target >= 25;
    }).length;
    const partTime = Math.max(0, totalTeachers - fullTime);

    summary.innerHTML = '';
    summary.append(
      createSummaryCard('Gesamt Lehrkräfte', totalTeachers.toString()),
      createSummaryCard('Deputat gesamt', `${totalIst}h`),
      createSummaryCard('Vollzeit', fullTime.toString(), 'text-green-600'),
      createSummaryCard('Teilzeit', partTime.toString(), 'text-orange-600'),
    );
  }

  function createSummaryCard(label, value, valueClass = 'text-gray-900') {
    const card = document.createElement('div');
    card.className = 'rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm';
    const labelEl = document.createElement('p');
    labelEl.className = 'text-xs font-semibold uppercase tracking-wide text-gray-500';
    labelEl.textContent = label;
    const valueEl = document.createElement('p');
    valueEl.className = `text-lg font-semibold ${valueClass}`;
    valueEl.textContent = value;
    card.append(labelEl, valueEl);
    return card;
  }

  loadTeachers();

  return {
    element: wrap,
    destroy() {
      status.destroy();
    },
  };
}

function teacherInputCell(
  teacher,
  field,
  setStatus,
  clearStatus,
  type = 'text',
  onUpdated,
  onPreview,
  options = {},
) {
  const {
    disabled = false,
    placeholder = '',
    min,
  } = options || {};
  const td = document.createElement('td');
  td.className = TABLE_CELL_CLASS;
  const input = document.createElement('input');
  input.type = type;
  input.className = inputClass('sm');
  if (placeholder) input.placeholder = placeholder;
  if (type === 'number') {
    if (typeof min !== 'undefined') {
      input.min = String(min);
    } else {
      input.min = '0';
    }
  }
  input.value = teacher[field] ?? '';
  if (disabled) {
    input.disabled = true;
    input.classList.add('bg-gray-100', 'text-gray-500', 'cursor-not-allowed');
    input.tabIndex = -1;
  }
  if (typeof onPreview === 'function' && !disabled) {
    input.addEventListener('input', () => {
      const previewValue = normalizeValue(input.type, input.value);
      onPreview(previewValue);
    });
  }
  if (!disabled) {
    input.addEventListener('blur', async () => {
      const newValue = normalizeValue(type, input.value);
      if ((teacher[field] ?? '') === newValue) return;
      const payload = buildTeacherUpdatePayload(teacher, { [field]: newValue });
      setStatus('Speichere…');
      try {
        const updated = await updateTeacher(teacher.id, payload);
        Object.assign(teacher, updated);
        setStatus('Gespeichert.');
        setTimeout(clearStatus, 1500);
        if (typeof onUpdated === 'function') {
          onUpdated();
        }
      } catch (err) {
        setStatus(`Fehler: ${formatError(err)}`, true);
      }
    });
  }
  td.appendChild(input);
  return td;
}

function teacherCheckboxCell(teacher, field, setStatus, clearStatus, onUpdated) {
  const td = document.createElement('td');
  td.className = `${TABLE_CELL_CLASS} text-center`;
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = checkboxClass();
  checkbox.checked = !!teacher[field];
  checkbox.addEventListener('change', async () => {
    const nextValue = checkbox.checked;
    setStatus('Speichere…');
    try {
      const payload = buildTeacherUpdatePayload(teacher, { [field]: nextValue });
      const updated = await updateTeacher(teacher.id, payload);
      Object.assign(teacher, updated);
      setStatus('Gespeichert.');
      setTimeout(clearStatus, 1500);
      if (typeof onUpdated === 'function') {
        onUpdated();
      }
    } catch (err) {
      setStatus(`Fehler: ${formatError(err)}`, true);
      checkbox.checked = !!teacher[field];
    }
  });
  const label = document.createElement('label');
  label.className = 'inline-flex items-center justify-center cursor-pointer';
  label.appendChild(checkbox);
  td.appendChild(label);
  return td;
}

function teacherBadgeCell(teacher) {
  const td = document.createElement('td');
  td.className = `${TABLE_CELL_CLASS} text-center`;
  const badge = createTeacherBadge(teacher, { size: 'sm' });
  badge.classList.add('shadow-sm');
  td.appendChild(badge);
  return {
    cell: td,
    update(next) {
      updateTeacherBadge(badge, next);
    },
  };
}

function teacherColorCell(teacher, setStatus, clearStatus, onUpdated, onPreview, options = {}) {
  const td = document.createElement('td');
  td.className = TABLE_CELL_CLASS;
  const wrap = document.createElement('div');
  wrap.className = 'flex items-center gap-3';

  const input = document.createElement('input');
  input.type = 'color';
  input.className = 'h-9 w-12 cursor-pointer rounded-lg border border-gray-200 bg-white p-1 focus:outline-none focus:ring-2 focus:ring-blue-500/40';
  input.value = normalizeColorValue(teacher.color);
  if (options.disabled) {
    input.disabled = true;
    input.classList.add('opacity-60', 'cursor-not-allowed');
    input.tabIndex = -1;
  }

  const label = document.createElement('span');
  label.className = 'text-xs font-mono text-gray-600';
  label.textContent = input.value.toUpperCase();

  input.addEventListener('change', async () => {
    const nextValue = input.value || DEFAULT_TEACHER_BADGE_COLOR;
    if (typeof onPreview === 'function') {
      onPreview(nextValue);
    }
    if (nextValue === normalizeColorValue(teacher.color) || options.disabled) return;
    setStatus('Speichere…');
    try {
      const payload = buildTeacherUpdatePayload(teacher, { color: nextValue });
      const updated = await updateTeacher(teacher.id, payload);
      Object.assign(teacher, updated);
      label.textContent = normalizeColorValue(teacher.color).toUpperCase();
      setStatus('Gespeichert.');
      setTimeout(clearStatus, 1500);
      if (typeof onUpdated === 'function') {
        onUpdated();
      }
    } catch (err) {
      setStatus(`Fehler: ${formatError(err)}`, true);
      input.value = normalizeColorValue(teacher.color);
      label.textContent = normalizeColorValue(teacher.color).toUpperCase();
      if (typeof onPreview === 'function') {
        onPreview(input.value);
      }
    }
  });

  wrap.append(input, label);
  td.appendChild(wrap);
  return td;
}

function teacherActionCell(teacher, reload, setStatus, clearStatus) {
  const td = document.createElement('td');
  td.className = `${TABLE_CELL_CLASS} text-right`;
  const btn = document.createElement('button');
  btn.className = `${buttonClass('ghost', 'sm')} text-red-600 hover:text-red-700 focus:ring-red-500/40`;
  btn.textContent = 'Löschen';
  if ((teacher.kuerzel || '').trim().toLowerCase() === 'pool') {
    btn.disabled = true;
    btn.classList.add('opacity-60', 'cursor-not-allowed');
    td.appendChild(btn);
    return td;
  }
  btn.addEventListener('click', async () => {
    const teacherLabel = buildTeacherName(teacher) || teacher.kuerzel || `#${teacher.id}`;
    const confirmed = await confirmModal({
      title: 'Lehrkraft löschen',
      message: `Lehrkraft "${teacherLabel}" wirklich löschen?`,
      confirmText: 'Löschen',
    });
    if (!confirmed) return;
    setStatus('Lösche Lehrkraft…');
    try {
      await deleteTeacher(teacher.id);
      await reload();
      setStatus('Lehrkraft gelöscht.');
      setTimeout(clearStatus, 1500);
    } catch (err) {
      setStatus(`Fehler: ${formatError(err)}`, true);
    }
  });
  td.appendChild(btn);
  return td;
}

function newTeacherRow(onRefresh, setStatus, clearStatus, existingTeachers = []) {
  const tr = document.createElement('tr');
  tr.className = `${TABLE_ROW_CLASS} bg-blue-50/40`;

  const draft = {
    first_name: '',
    last_name: '',
    kuerzel: '',
    deputat_soll: null,
    deputat: null,
    work_mo: true,
    work_di: true,
    work_mi: true,
    work_do: true,
    work_fr: true,
    color: pickNextTeacherColor(existingTeachers),
  };

  let firstEditable = null;

  const badgeCell = document.createElement('td');
  badgeCell.className = `${TABLE_CELL_CLASS} text-center`;
  const previewBadge = createTeacherBadge(draft, { size: 'sm', interactive: false });
  previewBadge.classList.add('shadow-sm');
  badgeCell.appendChild(previewBadge);
  tr.appendChild(badgeCell);

  const fields = [
    { field: 'first_name', placeholder: 'Vorname' },
    { field: 'last_name', placeholder: 'Nachname' },
    { field: 'kuerzel', placeholder: 'Kürzel*' },
    { field: 'deputat_soll', placeholder: 'Wochenstunden*', type: 'number' },
    { field: 'deputat', placeholder: 'Deputat', type: 'number' },
  ];

  const inputRefs = {};
  fields.forEach(({ field, placeholder, type = 'text' }) => {
    const td = document.createElement('td');
    td.className = TABLE_CELL_CLASS;
    const input = document.createElement('input');
    input.type = type;
    input.className = inputClass('sm');
    input.placeholder = placeholder;
    if (type === 'number') input.min = '0';
    inputRefs[field] = input;
    if (!firstEditable && type === 'text') {
      firstEditable = input;
    }
    input.addEventListener('input', () => {
      const newValue = normalizeValue(input.type, input.value);
      draft[field] = newValue;
      if (
        field === 'deputat_soll'
        && (draft.deputat === null || draft.deputat === '' || Number.isNaN(draft.deputat))
      ) {
        draft.deputat = newValue;
        if (inputRefs.deputat && inputRefs.deputat !== input) {
          inputRefs.deputat.value = input.value;
        }
      }
      updateTeacherBadge(previewBadge, draft);
      updateButtonState();
    });
    td.appendChild(input);
    tr.appendChild(td);

    if (field === 'kuerzel') {
      const colorTd = document.createElement('td');
      colorTd.className = TABLE_CELL_CLASS;
      const colorWrap = document.createElement('div');
      colorWrap.className = 'flex items-center gap-3';
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = draft.color;
      colorInput.className = 'h-9 w-12 cursor-pointer rounded-lg border border-gray-200 bg-white p-1 focus:outline-none focus:ring-2 focus:ring-blue-500/40';
      const colorLabel = document.createElement('span');
      colorLabel.className = 'text-xs font-mono text-gray-600';
      colorLabel.textContent = draft.color.toUpperCase();
      colorInput.addEventListener('input', () => {
        const value = colorInput.value || DEFAULT_TEACHER_BADGE_COLOR;
        draft.color = value;
        colorLabel.textContent = value.toUpperCase();
        updateTeacherBadge(previewBadge, draft);
      });
      colorWrap.append(colorInput, colorLabel);
      colorTd.appendChild(colorWrap);
      tr.appendChild(colorTd);
    }
  });

  ['work_mo', 'work_di', 'work_mi', 'work_do', 'work_fr'].forEach(field => {
    const td = document.createElement('td');
    td.className = `${TABLE_CELL_CLASS} text-center`;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = checkboxClass();
    checkbox.checked = true;
    checkbox.addEventListener('change', () => {
      draft[field] = checkbox.checked;
    });
    const label = document.createElement('label');
    label.className = 'inline-flex items-center justify-center cursor-pointer';
    label.appendChild(checkbox);
    td.appendChild(label);
    tr.appendChild(td);
  });

  const actionCell = document.createElement('td');
  actionCell.className = `${TABLE_CELL_CLASS} text-right`;
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = `${buttonClass('primary', 'sm')} px-3 gap-2`;
  addBtn.textContent = 'Anlegen';
  addBtn.disabled = true;
  addBtn.addEventListener('click', async () => {
    addBtn.disabled = true;
    setStatus('Lehrkraft wird angelegt…');
    try {
      const payload = buildCreateTeacher(draft);
      await createTeacher(payload);
      await onRefresh();
      setStatus('Lehrkraft angelegt.');
      setTimeout(clearStatus, 1500);
    } catch (err) {
      setStatus(`Fehler: ${formatError(err)}`, true);
    } finally {
      addBtn.disabled = false;
    }
  });
  actionCell.appendChild(addBtn);
  tr.appendChild(actionCell);

  function updateButtonState() {
    const hasKuerzel = typeof draft.kuerzel === 'string' && draft.kuerzel.trim().length >= 1;
    const hasDeputatSoll = Number.isFinite(draft.deputat_soll);
    const hasDeputat = Number.isFinite(draft.deputat);
    addBtn.disabled = !(hasKuerzel && (hasDeputat || hasDeputatSoll));
  }

  updateButtonState();

  return {
    row: tr,
    focus() {
      (firstEditable || tr.querySelector('input'))?.focus();
    },
  };
}

// --- Klassen ---
function createClassesSection(context = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'space-y-4';

  const { updateTabMetric } = context || {};
  const status = createStatusBar();

  const table = createTable(['Name*', 'Klassenlehrer', 'Aktion']);
  wrap.appendChild(table.wrapper);

  const state = { classes: [], teachers: [] };

  const setStatus = status.set;
  const clearStatus = status.clear;

  async function loadClasses() {
    setStatus('Lade Klassen…');
    try {
      const [classes, teachers] = await Promise.all([
        fetchClasses(),
        fetchTeachers(),
      ]);
      state.classes = classes.sort((a, b) => a.name.localeCompare(b.name));
      state.teachers = teachers;
      if (typeof updateTabMetric === 'function') {
        updateTabMetric(state.classes.length);
      }
      renderRows();
      setStatus(`${state.classes.length} Klassen geladen.`);
      setTimeout(clearStatus, 2000);
    } catch (err) {
      setStatus(`Fehler beim Laden: ${formatError(err)}`, true);
    }
  }

  function teacherOptions(selectedId) {
    const options = ['<option value="">—</option>'];
    state.teachers.forEach(t => {
      const label = t.kuerzel || t.name || `#${t.id}`;
      const selected = selectedId === t.id ? 'selected' : '';
      options.push(`<option value="${t.id}" ${selected}>${label}</option>`);
    });
    return options.join('');
  }

  function renderRows() {
    table.tbody.innerHTML = '';
    state.classes.forEach(cls => {
      const tr = document.createElement('tr');
      tr.className = TABLE_ROW_CLASS;

      const nameCell = document.createElement('td');
      nameCell.className = TABLE_CELL_CLASS;
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = inputClass('sm');
      nameInput.value = cls.name || '';
      nameInput.addEventListener('blur', async () => {
        const newValue = nameInput.value.trim();
        if (!newValue || newValue === cls.name) return;
        setStatus('Speichere…');
        try {
          const updated = await updateClass(cls.id, { name: newValue, homeroom_teacher_id: cls.homeroom_teacher_id });
          Object.assign(cls, updated);
          renderRows();
          setStatus('Gespeichert.');
          setTimeout(clearStatus, 1500);
        } catch (err) {
          setStatus(`Fehler: ${formatError(err)}`, true);
        }
      });
      nameCell.appendChild(nameInput);
      tr.appendChild(nameCell);

      const teacherCell = document.createElement('td');
      teacherCell.className = TABLE_CELL_CLASS;
      const select = document.createElement('select');
      select.className = selectClass('sm');
      select.innerHTML = teacherOptions(cls.homeroom_teacher_id);
      select.addEventListener('change', async () => {
        const value = select.value ? Number(select.value) : null;
        setStatus('Speichere…');
        try {
          const updated = await updateClass(cls.id, { name: cls.name, homeroom_teacher_id: value });
          Object.assign(cls, updated);
          setStatus('Gespeichert.');
          setTimeout(clearStatus, 1500);
        } catch (err) {
          setStatus(`Fehler: ${formatError(err)}`, true);
        }
      });
      teacherCell.appendChild(select);
      tr.appendChild(teacherCell);

      tr.appendChild(classActionCell(cls, loadClasses, setStatus, clearStatus));
      table.tbody.appendChild(tr);
    });

    table.tbody.appendChild(newClassRow(loadClasses, setStatus, clearStatus, teacherOptions));
  }

  loadClasses();
  return {
    element: wrap,
    destroy() {
      status.destroy();
    },
  };
}

function classActionCell(cls, reload, setStatus, clearStatus) {
  const td = document.createElement('td');
  td.className = `${TABLE_CELL_CLASS} text-right`;
  const btn = document.createElement('button');
  btn.className = `${buttonClass('ghost', 'sm')} text-red-600 hover:text-red-700 focus:ring-red-500/40`;
  btn.textContent = 'Löschen';
  btn.addEventListener('click', async () => {
    const confirmed = await confirmModal({
      title: 'Klasse löschen',
      message: `Klasse "${cls.name}" wirklich löschen?`,
      confirmText: 'Löschen',
    });
    if (!confirmed) return;
    setStatus('Lösche Klasse…');
    try {
      await deleteClass(cls.id);
      await reload();
      setStatus('Klasse gelöscht.');
      setTimeout(clearStatus, 1500);
    } catch (err) {
      setStatus(`Fehler: ${formatError(err)}`, true);
    }
  });
  td.appendChild(btn);
  return td;
}

function newClassRow(onRefresh, setStatus, clearStatus, teacherOptions) {
  const tr = document.createElement('tr');
  tr.className = `${TABLE_ROW_CLASS} bg-blue-50/40`;

  const draft = { name: '', homeroom_teacher_id: null };

  const nameCell = document.createElement('td');
  nameCell.className = TABLE_CELL_CLASS;
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = inputClass('sm');
  nameInput.placeholder = 'Klassenname*';
  nameInput.addEventListener('input', () => {
    draft.name = nameInput.value.trim();
    updateButtonState();
  });
  nameCell.appendChild(nameInput);
  tr.appendChild(nameCell);

  const teacherCell = document.createElement('td');
  teacherCell.className = TABLE_CELL_CLASS;
  const select = document.createElement('select');
  select.className = selectClass('sm');
  select.innerHTML = teacherOptions(null);
  select.addEventListener('change', () => {
    draft.homeroom_teacher_id = select.value ? Number(select.value) : null;
  });
  teacherCell.appendChild(select);
  tr.appendChild(teacherCell);

  const actionCell = document.createElement('td');
  actionCell.className = `${TABLE_CELL_CLASS} text-right`;
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = buttonClass('primary', 'sm');
  addBtn.textContent = 'Anlegen';
  addBtn.disabled = true;
  addBtn.addEventListener('click', async () => {
    addBtn.disabled = true;
    setStatus('Klasse wird angelegt…');
    try {
      await createClass({ name: draft.name, homeroom_teacher_id: draft.homeroom_teacher_id });
      await onRefresh();
      setStatus('Klasse angelegt.');
      setTimeout(clearStatus, 1500);
    } catch (err) {
      setStatus(`Fehler: ${formatError(err)}`, true);
    } finally {
      addBtn.disabled = false;
    }
  });
  actionCell.appendChild(addBtn);
  tr.appendChild(actionCell);

  function updateButtonState() {
    addBtn.disabled = !(draft.name && draft.name.length >= 1);
  }

  return tr;
}

// --- Fächer ---
function createSubjectsSection(context = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'space-y-3';

  const status = createStatusBar();

  const table = createTable([
    'Name*',
    'Kürzel',
    'Farbe',
    'Bandfach',
    'AG/Förder',
    'Aktion',
  ]);
  wrap.appendChild(table.wrapper);

  const state = { subjects: [], rooms: [], classes: [], curriculumMap: new Map() };
  const setStatus = status.set;
  const clearStatus = status.clear;

  async function loadData() {
    setStatus('Lade Fächer…');
    try {
      const [subjects, rooms, classes, curriculum] = await Promise.all([
        fetchSubjects(),
        fetchRooms(),
        fetchClasses(),
        fetchCurriculum(),
      ]);
      state.subjects = subjects.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      state.rooms = rooms.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      state.classes = classes.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      state.curriculumMap = new Map(curriculum.map(entry => [`${entry.class_id}|${entry.subject_id}`, normalizeSubjectCurriculumEntry(entry)]));
      if (typeof updateTabMetric === 'function') {
        updateTabMetric(state.subjects.length);
      }
      renderRows();
      setStatus(`${state.subjects.length} Fächer geladen.`);
      setTimeout(clearStatus, 2000);
    } catch (err) {
      setStatus(`Fehler beim Laden: ${formatError(err)}`, true);
    }
  }

  function renderRows() {
    state.subjectsMap = new Map(state.subjects.map(item => [item.id, item]));
    table.tbody.innerHTML = '';
    state.subjects.forEach(subject => {
      const tr = document.createElement('tr');
      tr.className = TABLE_ROW_CLASS;
      tr.append(
        subjectInputCell(subject, 'name', setStatus, clearStatus, { required: true, placeholder: 'Fachname' }),
        subjectInputCell(subject, 'kuerzel', setStatus, clearStatus, { placeholder: 'Kürzel' }),
        subjectInputCell(subject, 'color', setStatus, clearStatus),
        subjectBandCheckboxCell(subject, setStatus, clearStatus),
        subjectAgCheckboxCell(subject, setStatus, clearStatus),
        subjectActionCell(subject, setStatus, clearStatus, loadData),
      );
      table.tbody.appendChild(tr);
    });
    const draft = newSubjectRow(loadData, setStatus, clearStatus);
    draft.row.dataset.newSubjectRow = 'true';
    table.tbody.appendChild(draft.row);
  }

  loadData();
  return {
    element: wrap,
    destroy() {
      status.destroy();
    },
  };

  function curriculumKey(classId, subjectId) {
    return `${classId}|${subjectId}`;
  }

  function normalizeSubjectCurriculumEntry(entry = {}) {
    if (!entry) return {};
    return {
      ...entry,
      participation: entry.participation || 'curriculum',
      doppelstunde: entry.doppelstunde || null,
      nachmittag: entry.nachmittag || null,
    };
  }

  function updateCurriculumState(entry) {
    if (!entry) return;
    const normalized = normalizeSubjectCurriculumEntry(entry);
    const key = curriculumKey(normalized.class_id, normalized.subject_id);
    state.curriculumMap.set(key, normalized);
    state.curriculum = Array.from(state.curriculumMap.values());
  }

  function removeCurriculumState(classId, subjectId) {
    const key = curriculumKey(classId, subjectId);
    state.curriculumMap.delete(key);
    state.curriculum = Array.from(state.curriculumMap.values());
  }

  function openSubjectConfigModal(subject) {
    if (!subject?.id) return;
    if (!state.classes.length) {
      setStatus('Keine Klassen geladen.', true);
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4';

    const modal = document.createElement('div');
    modal.className = 'w-full max-w-5xl max-h-[90vh] overflow-hidden bg-white rounded-2xl shadow-2xl flex flex-col';

    const header = document.createElement('div');
    header.className = 'flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4';

    const titleWrap = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'text-xl font-semibold';
    title.textContent = `Stundentafel · ${subject.name || subject.kuerzel || 'Fach'}`;
    const subtitle = document.createElement('p');
    subtitle.className = 'text-sm text-gray-500';
    const defaultDoppel = subject.default_doppelstunde || '';
    const defaultNachmittag = subject.default_nachmittag || '';
    subtitle.textContent = [
      defaultDoppel ? `Doppelstunde: ${labelForSubjectDefault(defaultDoppel)}` : 'Doppelstunde: –',
      defaultNachmittag ? `Nachmittag: ${labelForNachmittagDefault(defaultNachmittag)}` : 'Nachmittag: –',
    ].join(' · ');
    titleWrap.append(title, subtitle);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = buttonClass('ghost', 'sm');
    closeBtn.textContent = 'Schließen';

    header.append(titleWrap, closeBtn);

    const metaSection = document.createElement('div');
    metaSection.className = 'grid gap-4 px-6 py-4 border-b border-gray-100 sm:grid-cols-2 lg:grid-cols-4';

    function appendMetaSelect(labelText, options, currentValue, onUpdate) {
      const field = document.createElement('div');
      field.className = 'flex flex-col gap-1';
      const label = document.createElement('span');
      label.className = 'text-xs font-semibold uppercase tracking-wide text-gray-500';
      label.textContent = labelText;
      const select = document.createElement('select');
      select.className = selectClass('sm');
      select.innerHTML = options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
      let currentSelection = currentValue || null;
      select.value = currentSelection || '';
      select.addEventListener('change', async () => {
        const raw = select.value;
        const normalized = raw === '' ? null : raw;
        try {
          setModalStatus('Speichere…');
          const updated = await updateSubject(subject.id, onUpdate(normalized));
          Object.assign(subject, updated);
          currentSelection = normalized;
          setModalStatus('Gespeichert.');
          renderRows();
        } catch (err) {
          setModalStatus(formatError(err), true);
          select.value = currentSelection || '';
        }
      });
      field.append(label, select);
      metaSection.appendChild(field);
      return select;
    }

    const doppelSelect = appendMetaSelect('Doppelstunde', SUBJECT_DOPPEL_OPTIONS, subject.default_doppelstunde || '', value => ({ default_doppelstunde: value }));
    const nachmittagSelect = appendMetaSelect('Nachmittag', SUBJECT_NACHMITTAG_OPTIONS, subject.default_nachmittag || '', value => ({ default_nachmittag: value }));

    const roomField = document.createElement('div');
    roomField.className = 'flex flex-col gap-1';
    const roomLabel = document.createElement('span');
    roomLabel.className = 'text-xs font-semibold uppercase tracking-wide text-gray-500';
    roomLabel.textContent = 'Pflicht-Raum';
    const roomSelect = document.createElement('select');
    roomSelect.className = selectClass('sm');
    roomSelect.innerHTML = ['<option value="">Kein Pflicht-Raum</option>', ...state.rooms.map(room => `<option value="${room.id}">${room.name}</option>`)].join('');
    roomSelect.value = subject.required_room_id || '';
    roomSelect.addEventListener('change', async () => {
      const normalized = roomSelect.value ? Number(roomSelect.value) : null;
      try {
        setModalStatus('Speichere…');
        const updated = await updateSubject(subject.id, { required_room_id: normalized });
        Object.assign(subject, updated);
        setModalStatus('Gespeichert.');
        renderRows();
      } catch (err) {
        setModalStatus(formatError(err), true);
        roomSelect.value = subject.required_room_id || '';
      }
    });
    roomField.append(roomLabel, roomSelect);
    metaSection.appendChild(roomField);

    const aliasField = document.createElement('div');
    aliasField.className = 'flex flex-col gap-1';
    const aliasLabel = document.createElement('span');
    aliasLabel.className = 'text-xs font-semibold uppercase tracking-wide text-gray-500';
    aliasLabel.textContent = 'Alias-Fach';
    const aliasSelect = document.createElement('select');
    aliasSelect.className = selectClass('sm');
    populateAliasSelect(aliasSelect, state.subjects, subject.id);
    aliasSelect.value = subject.alias_subject_id || '';
    aliasSelect.addEventListener('change', async () => {
      const normalized = aliasSelect.value ? Number(aliasSelect.value) : null;
      if (normalized === subject.id) {
        aliasSelect.value = subject.alias_subject_id || '';
        return;
      }
      try {
        setModalStatus('Speichere…');
        const updated = await updateSubject(subject.id, { alias_subject_id: normalized });
        Object.assign(subject, updated);
        setModalStatus('Gespeichert.');
        renderRows();
      } catch (err) {
        setModalStatus(formatError(err), true);
        aliasSelect.value = subject.alias_subject_id || '';
      }
    });
    aliasField.append(aliasLabel, aliasSelect);
    metaSection.appendChild(aliasField);

    const content = document.createElement('div');
    content.className = 'flex-1 overflow-auto px-6 py-4';

    const hint = document.createElement('p');
    hint.className = 'text-xs text-gray-500 mb-3';
    hint.textContent = 'Änderungen werden beim Verlassen des Feldes automatisch gespeichert. Leere Stunden entfernen den Eintrag und nutzen die Fach-Standards.';

    const table = document.createElement('table');
    table.className = 'min-w-full divide-y divide-gray-200 text-sm';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['Klasse', 'Wochenstunden', 'Doppelstunde', 'Nachmittag', 'Status'].forEach(label => {
      const th = document.createElement('th');
      th.className = TABLE_HEAD_CELL_CLASS;
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);

    const tbody = document.createElement('tbody');

    const statusLine = document.createElement('div');
    statusLine.className = 'text-xs text-gray-500 min-h-[1.25rem] px-6 py-2 border-t border-gray-200';

    let statusTimer = null;
    function setModalStatus(message, error = false) {
      clearTimeout(statusTimer);
      statusLine.textContent = message || '';
      statusLine.classList.remove('text-red-600', 'text-green-600');
      if (message) {
        statusLine.classList.add(error ? 'text-red-600' : 'text-green-600');
        statusTimer = setTimeout(() => {
          statusLine.textContent = '';
          statusLine.classList.remove('text-red-600', 'text-green-600');
        }, error ? 4000 : 1800);
      }
    }

    state.classes.forEach(cls => {
      const entryKey = curriculumKey(cls.id, subject.id);
      const existing = state.curriculumMap.get(entryKey);
      const rowState = {
        classId: cls.id,
        subjectId: subject.id,
        entryId: existing?.id ?? null,
        hours: existing?.wochenstunden ?? '',
        participation: existing?.participation || 'curriculum',
        doppelstunde: existing?.doppelstunde || '',
        nachmittag: existing?.nachmittag || '',
      };

      const row = document.createElement('tr');
      row.className = TABLE_ROW_CLASS;
      const classCell = document.createElement('td');
      classCell.className = TABLE_CELL_CLASS;
      classCell.textContent = cls.name || `Klasse #${cls.id}`;
      row.appendChild(classCell);

      const hoursCell = document.createElement('td');
      hoursCell.className = TABLE_CELL_CLASS;
      const hoursInput = document.createElement('input');
      hoursInput.type = 'number';
      hoursInput.min = '0';
      hoursInput.placeholder = '0';
      hoursInput.className = `${inputClass('sm')} w-24`;
      hoursInput.value = rowState.hours !== '' ? rowState.hours : '';
      hoursCell.appendChild(hoursInput);
      row.appendChild(hoursCell);

      const doubleCell = document.createElement('td');
      doubleCell.className = TABLE_CELL_CLASS;
      const doubleSelect = document.createElement('select');
      doubleSelect.className = selectClass('sm');
      doubleSelect.innerHTML = CURRICULUM_DOPPEL_OPTIONS.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
      doubleSelect.value = rowState.doppelstunde || '';
      doubleCell.appendChild(doubleSelect);
      row.appendChild(doubleCell);

      const afternoonCell = document.createElement('td');
      afternoonCell.className = TABLE_CELL_CLASS;
      const afternoonSelect = document.createElement('select');
      afternoonSelect.className = selectClass('sm');
      afternoonSelect.innerHTML = CURRICULUM_NACHMITTAG_OPTIONS.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
      afternoonSelect.value = rowState.nachmittag || '';
      afternoonCell.appendChild(afternoonSelect);
      row.appendChild(afternoonCell);

      const participationCell = document.createElement('td');
      participationCell.className = TABLE_CELL_CLASS;
      const participationSelect = document.createElement('select');
      participationSelect.className = selectClass('sm');
      participationSelect.innerHTML = CURRICULUM_PARTICIPATION_OPTIONS.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
      participationSelect.value = rowState.participation || 'curriculum';
      participationCell.appendChild(participationSelect);
      row.appendChild(participationCell);

      const controls = {
        hoursInput,
        doubleSelect,
        afternoonSelect,
        participationSelect,
      };

      function updateControlsState() {
        const hoursValue = parseHours(rowState.hours);
        const hasHours = hoursValue !== null;
        const isActive = hasHours || !!rowState.entryId;
        doubleSelect.disabled = !isActive;
        afternoonSelect.disabled = !isActive;
        participationSelect.disabled = !isActive;
      }

      hoursInput.addEventListener('input', () => {
        rowState.hours = hoursInput.value;
        updateControlsState();
      });
      hoursInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          hoursInput.blur();
        }
      });
      hoursInput.addEventListener('blur', () => {
        rowState.hours = hoursInput.value;
        persistRow(rowState, controls);
      });

      doubleSelect.addEventListener('change', () => {
        rowState.doppelstunde = doubleSelect.value;
        persistRow(rowState, controls);
      });
      afternoonSelect.addEventListener('change', () => {
        rowState.nachmittag = afternoonSelect.value;
        persistRow(rowState, controls);
      });
      participationSelect.addEventListener('change', () => {
        rowState.participation = participationSelect.value;
        persistRow(rowState, controls);
      });

      function parseHours(raw) {
        const trimmed = (raw ?? '').toString().trim();
        if (!trimmed) return null;
        const value = Number(trimmed);
        if (!Number.isFinite(value) || value <= 0) return null;
        return value;
      }

      async function persistRow(currentState, currentControls) {
        const hoursValue = parseHours(currentState.hours);
        const hasHours = hoursValue !== null;
        const payloadBase = {
          participation: currentState.participation || 'curriculum',
          doppelstunde: currentState.doppelstunde || null,
          nachmittag: currentState.nachmittag || null,
        };

        try {
          if (hasHours) {
            if (currentState.entryId) {
              const updated = await updateCurriculum(currentState.entryId, {
                ...payloadBase,
                wochenstunden: hoursValue,
              });
              const normalized = normalizeSubjectCurriculumEntry(updated || { ...currentState, wochenstunden: hoursValue });
              Object.assign(currentState, {
                entryId: normalized.id,
                hours: normalized.wochenstunden,
                participation: normalized.participation,
                doppelstunde: normalized.doppelstunde || '',
                nachmittag: normalized.nachmittag || '',
              });
              currentControls.hoursInput.value = normalized.wochenstunden ?? '';
              currentControls.doubleSelect.value = currentState.doppelstunde || '';
              currentControls.afternoonSelect.value = currentState.nachmittag || '';
              currentControls.participationSelect.value = currentState.participation || 'curriculum';
              setModalStatus('Gespeichert.');
              updateCurriculumState(normalized);
            } else {
              const created = await createCurriculum({
                class_id: currentState.classId,
                subject_id: currentState.subjectId,
                wochenstunden: hoursValue,
                participation: payloadBase.participation,
                doppelstunde: payloadBase.doppelstunde,
                nachmittag: payloadBase.nachmittag,
              });
              const normalized = normalizeSubjectCurriculumEntry(created);
              Object.assign(currentState, {
                entryId: normalized.id,
                hours: normalized.wochenstunden,
                participation: normalized.participation,
                doppelstunde: normalized.doppelstunde || '',
                nachmittag: normalized.nachmittag || '',
              });
              currentControls.hoursInput.value = normalized.wochenstunden ?? '';
              currentControls.doubleSelect.value = currentState.doppelstunde || '';
              currentControls.afternoonSelect.value = currentState.nachmittag || '';
              currentControls.participationSelect.value = currentState.participation || 'curriculum';
              setModalStatus('Eintrag angelegt.');
              updateCurriculumState(normalized);
            }
          } else if (currentState.entryId) {
            await deleteCurriculum(currentState.entryId);
            removeCurriculumState(currentState.classId, currentState.subjectId);
            Object.assign(currentState, {
              entryId: null,
              hours: '',
              participation: 'curriculum',
              doppelstunde: '',
              nachmittag: '',
            });
            currentControls.hoursInput.value = '';
            currentControls.doubleSelect.value = '';
            currentControls.afternoonSelect.value = '';
            currentControls.participationSelect.value = 'curriculum';
            setModalStatus('Eintrag entfernt.');
          } else {
            currentControls.hoursInput.value = '';
            currentControls.doubleSelect.value = '';
            currentControls.afternoonSelect.value = '';
            currentControls.participationSelect.value = 'curriculum';
          }
        } catch (err) {
          setModalStatus(`Fehler: ${formatError(err)}`, true);
          const existingEntry = state.curriculumMap.get(curriculumKey(currentState.classId, currentState.subjectId));
          if (existingEntry) {
            currentControls.hoursInput.value = existingEntry.wochenstunden ?? '';
            currentControls.doubleSelect.value = existingEntry.doppelstunde || '';
            currentControls.afternoonSelect.value = existingEntry.nachmittag || '';
            currentControls.participationSelect.value = existingEntry.participation || 'curriculum';
            Object.assign(currentState, {
              entryId: existingEntry.id,
              hours: existingEntry.wochenstunden ?? '',
              participation: existingEntry.participation || 'curriculum',
              doppelstunde: existingEntry.doppelstunde || '',
              nachmittag: existingEntry.nachmittag || '',
            });
          } else {
            currentControls.hoursInput.value = '';
            currentControls.doubleSelect.value = '';
            currentControls.afternoonSelect.value = '';
            currentControls.participationSelect.value = 'curriculum';
            Object.assign(currentState, {
              entryId: null,
              hours: '',
              participation: 'curriculum',
              doppelstunde: '',
              nachmittag: '',
            });
          }
        }
        updateControlsState();
      }

      updateControlsState();
      tbody.appendChild(row);
    });

    table.append(thead, tbody);
    content.append(hint, table);

    const footer = document.createElement('div');
    footer.className = 'px-6 py-3 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500';
    const legend = document.createElement('p');
    legend.className = 'text-xs';
    legend.textContent = 'Leere Stunden löschen den Eintrag. Einstellungen ohne Eintrag nutzen die Fach-Standards.';
    const closeFooterBtn = document.createElement('button');
    closeFooterBtn.className = buttonClass('ghost', 'sm');
    closeFooterBtn.type = 'button';
    closeFooterBtn.textContent = 'Schließen';
    footer.append(legend, closeFooterBtn);

    modal.append(header, metaSection, content, statusLine, footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function closeModal() {
      clearTimeout(statusTimer);
      overlay.remove();
      window.removeEventListener('keydown', onKeydown);
    }

    function onKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
      }
    }

    window.addEventListener('keydown', onKeydown);
    closeBtn.addEventListener('click', closeModal);
    closeFooterBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) {
        closeModal();
      }
    });
  }

  function labelForSubjectDefault(value) {
    const match = SUBJECT_DOPPEL_OPTIONS.find(opt => opt.value === value);
    return match ? match.label : value;
  }

  function labelForNachmittagDefault(value) {
    const match = SUBJECT_NACHMITTAG_OPTIONS.find(opt => opt.value === value);
    return match ? match.label : value;
  }

  function subjectInputCell(subject, field, setStatusFn, clearStatusFn, opts = {}) {
    const td = document.createElement('td');
    td.className = TABLE_CELL_CLASS;

    if (field === 'color') {
      const wrap = document.createElement('div');
      wrap.className = 'flex items-center gap-3';

      const normalize = value => (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : '#2563eb');
      const initial = normalize(subject.color);

      const input = document.createElement('input');
      input.type = 'color';
      input.value = initial;
      input.className = 'h-9 w-12 cursor-pointer rounded-lg border border-gray-200 bg-white p-1 focus:outline-none focus:ring-2 focus:ring-blue-500/40';

      const label = document.createElement('span');
      label.className = 'text-xs font-mono text-gray-600';
      label.textContent = initial.toUpperCase();

      input.addEventListener('change', async () => {
        const value = normalize(input.value);
        if (value === (normalize(subject.color))) {
          label.textContent = value.toUpperCase();
          return;
        }
        setStatusFn('Speichere…');
        try {
          const updated = await updateSubject(subject.id, { color: value });
          Object.assign(subject, updated);
          label.textContent = normalize(updated?.color).toUpperCase();
          setStatusFn('Gespeichert.');
          setTimeout(clearStatusFn, 1500);
        } catch (err) {
          setStatusFn(`Fehler: ${formatError(err)}`, true);
          input.value = normalize(subject.color);
          label.textContent = normalize(subject.color).toUpperCase();
        }
      });

      wrap.append(input, label);
      td.appendChild(wrap);
      return td;
    }

    const input = document.createElement('input');
    input.type = opts.type || 'text';
    input.className = inputClass('sm');
    input.value = subject[field] ?? '';
    if (opts.placeholder) input.placeholder = opts.placeholder;
    input.addEventListener('blur', async () => {
      const value = input.value.trim();
      if (opts.required && !value) {
        input.value = subject[field] ?? '';
        return;
      }
      if ((subject[field] ?? '') === value) return;
      const payload = { [field]: value || null };
      setStatusFn('Speichere…');
      try {
        const updated = await updateSubject(subject.id, payload);
        Object.assign(subject, updated);
        setStatusFn('Gespeichert.');
        setTimeout(clearStatusFn, 1500);
      } catch (err) {
        setStatusFn(`Fehler: ${formatError(err)}`, true);
        input.value = subject[field] ?? '';
      }
    });
    td.appendChild(input);
    return td;
  }

  function subjectBandCheckboxCell(subject, setStatusFn, clearStatusFn) {
    const td = document.createElement('td');
    td.className = `${TABLE_CELL_CLASS} text-center`;
    const label = document.createElement('label');
    label.className = 'inline-flex items-center justify-center cursor-pointer';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = checkboxClass();
    checkbox.checked = !!subject.is_bandfach;
    checkbox.addEventListener('change', async () => {
      setStatusFn('Speichere…');
      try {
        const updated = await updateSubject(subject.id, { is_bandfach: checkbox.checked });
        Object.assign(subject, updated);
        setStatusFn('Gespeichert.');
        setTimeout(clearStatusFn, 1500);
      } catch (err) {
        setStatusFn(`Fehler: ${formatError(err)}`, true);
        checkbox.checked = !!subject.is_bandfach;
      }
    });
    label.appendChild(checkbox);
    td.appendChild(label);
    return td;
  }

  function subjectAgCheckboxCell(subject, setStatusFn, clearStatusFn) {
    const td = document.createElement('td');
    td.className = `${TABLE_CELL_CLASS} text-center`;
    const label = document.createElement('label');
    label.className = 'inline-flex items-center justify-center cursor-pointer';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = checkboxClass();
    checkbox.checked = !!subject.is_ag_foerder;
    checkbox.addEventListener('change', async () => {
      setStatusFn('Speichere…');
      try {
        const updated = await updateSubject(subject.id, { is_ag_foerder: checkbox.checked });
        Object.assign(subject, updated);
        setStatusFn('Gespeichert.');
        setTimeout(clearStatusFn, 1500);
      } catch (err) {
        setStatusFn(`Fehler: ${formatError(err)}`, true);
        checkbox.checked = !!subject.is_ag_foerder;
      }
    });
    label.appendChild(checkbox);
    td.appendChild(label);
    return td;
  }

  function populateAliasSelect(select, subjects, excludeId = null) {
    select.innerHTML = '';
    const noneOption = document.createElement('option');
    noneOption.value = '';
    noneOption.textContent = 'Kein Alias';
    select.appendChild(noneOption);
    subjects
      .filter(item => item.id && item.id !== excludeId)
      .forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.name || `Fach #${item.id}`;
        select.appendChild(opt);
      });
  }

  function subjectActionCell(subject, setStatusFn, clearStatusFn, reloadFn) {
    const td = document.createElement('td');
    td.className = `${TABLE_CELL_CLASS} text-right`;
    const actionWrap = document.createElement('div');
    actionWrap.className = 'flex justify-end gap-2';

    const configBtn = document.createElement('button');
    configBtn.type = 'button';
    configBtn.className = `${buttonClass('outline', 'sm')} whitespace-nowrap`;
    configBtn.textContent = 'Details';
    configBtn.addEventListener('click', () => openSubjectConfigModal(subject));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = `${buttonClass('ghost', 'sm')} text-red-600 hover:text-red-700 focus:ring-red-500/40`;
    deleteBtn.textContent = 'Löschen';
    deleteBtn.addEventListener('click', async () => {
      const confirmed = await confirmModal({
        title: 'Fach löschen',
        message: `Fach "${subject.name}" wirklich löschen?`,
        confirmText: 'Löschen',
      });
      if (!confirmed) return;
      setStatusFn('Lösche Fach…');
      try {
        await deleteSubject(subject.id);
        await reloadFn();
        setStatusFn('Fach gelöscht.');
        setTimeout(clearStatusFn, 1500);
      } catch (err) {
        setStatusFn(`Fehler: ${formatError(err)}`, true);
      }
    });
    actionWrap.append(configBtn, deleteBtn);
    td.appendChild(actionWrap);
    return td;
  }

  function newSubjectRow(onRefresh, setStatusFn, clearStatusFn) {
    const tr = document.createElement('tr');
    tr.className = `${TABLE_ROW_CLASS} bg-blue-50/40`;

    const draft = {
      name: '',
      kuerzel: '',
      color: '#2563eb',
      is_bandfach: false,
      is_ag_foerder: false,
    };

    const nameCell = subjectDraftInput('Name*', value => {
      draft.name = value;
      updateButtonState();
    });
    tr.appendChild(nameCell);

    const kuerzelCell = subjectDraftInput('Kürzel', value => {
      draft.kuerzel = value;
    });
    tr.appendChild(kuerzelCell);

    const colorCell = document.createElement('td');
    colorCell.className = TABLE_CELL_CLASS;
    const colorWrap = document.createElement('div');
    colorWrap.className = 'flex items-center gap-3';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = draft.color;
    colorInput.className = 'h-9 w-12 cursor-pointer rounded-lg border border-gray-200 bg-white p-1 focus:outline-none focus:ring-2 focus:ring-blue-500/40';
    const colorLabel = document.createElement('span');
    colorLabel.className = 'text-xs font-mono text-gray-600';
    colorLabel.textContent = draft.color.toUpperCase();
    colorInput.addEventListener('input', () => {
      draft.color = colorInput.value;
      colorLabel.textContent = draft.color.toUpperCase();
    });
    colorWrap.append(colorInput, colorLabel);
    colorCell.appendChild(colorWrap);
    tr.appendChild(colorCell);

    const bandCell = document.createElement('td');
    bandCell.className = `${TABLE_CELL_CLASS} text-center`;
    const bandLabel = document.createElement('label');
    bandLabel.className = 'inline-flex items-center justify-center cursor-pointer';
    const bandCheckbox = document.createElement('input');
    bandCheckbox.type = 'checkbox';
    bandCheckbox.className = checkboxClass();
    bandCheckbox.addEventListener('change', () => {
      draft.is_bandfach = bandCheckbox.checked;
    });
    bandLabel.appendChild(bandCheckbox);
    bandCell.appendChild(bandLabel);
    tr.appendChild(bandCell);

    const agCell = document.createElement('td');
    agCell.className = `${TABLE_CELL_CLASS} text-center`;
    const agLabel = document.createElement('label');
    agLabel.className = 'inline-flex items-center justify-center cursor-pointer';
    const agCheckbox = document.createElement('input');
    agCheckbox.type = 'checkbox';
    agCheckbox.className = checkboxClass();
    agCheckbox.addEventListener('change', () => {
      draft.is_ag_foerder = agCheckbox.checked;
    });
    agLabel.appendChild(agCheckbox);
    agCell.appendChild(agLabel);
    tr.appendChild(agCell);

    const actionCell = document.createElement('td');
    actionCell.className = `${TABLE_CELL_CLASS} text-right`;
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = buttonClass('primary', 'sm');
    addBtn.textContent = 'Anlegen';
    addBtn.disabled = true;
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true;
      setStatusFn('Fach wird angelegt…');
      try {
        const payload = {
          name: draft.name,
          kuerzel: draft.kuerzel || null,
          color: draft.color || null,
          is_bandfach: draft.is_bandfach,
          is_ag_foerder: draft.is_ag_foerder,
        };
        const created = await createSubject(payload);
        state.subjects.push(created);
        state.subjects.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        renderRows();
        setStatusFn('Fach angelegt.');
        setTimeout(clearStatusFn, 1500);
      } catch (err) {
        setStatusFn(`Fehler: ${formatError(err)}`, true);
      } finally {
        addBtn.disabled = false;
      }
    });
    actionCell.appendChild(addBtn);
    tr.appendChild(actionCell);

    function updateButtonState() {
      addBtn.disabled = !(draft.name && draft.name.length >= 1);
    }

    return {
      row: tr,
      focus() {
        const firstInput = tr.querySelector('input[type="text"]');
        if (firstInput) firstInput.focus();
      },
    };
  }

  function subjectDraftInput(placeholder, onChange) {
    const td = document.createElement('td');
    td.className = TABLE_CELL_CLASS;
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.className = inputClass('sm');
    input.addEventListener('input', () => {
      onChange(input.value.trim());
    });
    td.appendChild(input);
    return td;
  }
}

// --- Räume ---
function createRoomsSection(context = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'space-y-3';

  const status = createStatusBar();

  const table = createTable(['Name*', 'Typ', 'Kapazität', 'Klassenraum', 'Aktion']);
  wrap.appendChild(table.wrapper);

  const state = { rooms: [] };
  const setStatus = status.set;
  const clearStatus = status.clear;

  async function loadRooms() {
    setStatus('Lade Räume…');
    try {
      const rooms = await fetchRooms();
      state.rooms = rooms.sort((a, b) => a.name.localeCompare(b.name));
      renderRows();
      setStatus(`${state.rooms.length} Räume geladen.`);
      setTimeout(clearStatus, 2000);
    } catch (err) {
      setStatus(`Fehler beim Laden: ${formatError(err)}`, true);
    }
  }

  function renderRows() {
    table.tbody.innerHTML = '';
    state.rooms.forEach(room => {
      const tr = document.createElement('tr');
      tr.className = TABLE_ROW_CLASS;
      tr.appendChild(roomNameCell(room, setStatus, clearStatus, renderRows));
      tr.appendChild(roomTypeCell(room, setStatus, clearStatus));
      tr.appendChild(roomCapacityCell(room, setStatus, clearStatus));
      tr.appendChild(roomClassroomCell(room, setStatus, clearStatus));
      tr.appendChild(roomActionCell(room, setStatus, clearStatus, loadRooms));
      table.tbody.appendChild(tr);
    });

    table.tbody.appendChild(newRoomRow(loadRooms, setStatus, clearStatus));
  }

  loadRooms();
  return {
    element: wrap,
    destroy() {
      status.destroy();
    },
  };
}

function roomNameCell(room, setStatus, clearStatus, rerender) {
  const td = document.createElement('td');
  td.className = TABLE_CELL_CLASS;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = inputClass('sm');
  input.value = room.name || '';
  input.addEventListener('blur', async () => {
    const newName = input.value.trim();
    if (!newName || newName === room.name) return;
    setStatus('Speichere…');
    try {
      const updated = await updateRoom(room.id, { name: newName });
      Object.assign(room, updated);
      rerender();
      setStatus('Gespeichert.');
      setTimeout(clearStatus, 1500);
    } catch (err) {
      setStatus(`Fehler: ${formatError(err)}`, true);
      input.value = room.name || '';
    }
  });
  td.appendChild(input);
  return td;
}

function roomTypeCell(room, setStatus, clearStatus) {
  const td = document.createElement('td');
  td.className = TABLE_CELL_CLASS;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = inputClass('sm');
  input.value = room.type || '';
  input.placeholder = 'z. B. Fachraum';
  input.addEventListener('blur', async () => {
    const newType = input.value.trim();
    if ((room.type || '') === newType) return;
    setStatus('Speichere…');
    try {
      const updated = await updateRoom(room.id, { type: newType });
      Object.assign(room, updated);
      setStatus('Gespeichert.');
      setTimeout(clearStatus, 1500);
    } catch (err) {
      setStatus(`Fehler: ${formatError(err)}`, true);
      input.value = room.type || '';
    }
  });
  td.appendChild(input);
  return td;
}

function roomCapacityCell(room, setStatus, clearStatus) {
  const td = document.createElement('td');
  td.className = TABLE_CELL_CLASS;
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.className = `${inputClass('sm')} w-24`;
  input.value = room.capacity ?? '';
  input.placeholder = '0';
  input.addEventListener('blur', async () => {
    const raw = input.value.trim();
    if (raw === '') {
      if (room.capacity == null) return;
      input.value = room.capacity ?? '';
      return;
    }
    const newValue = Number(raw);
    if (Number.isNaN(newValue) || newValue < 0) {
      input.value = room.capacity ?? '';
      return;
    }
    if (room.capacity === newValue) return;
    setStatus('Speichere…');
    try {
      const updated = await updateRoom(room.id, { capacity: newValue });
      Object.assign(room, updated);
      setStatus('Gespeichert.');
      setTimeout(clearStatus, 1500);
    } catch (err) {
      setStatus(`Fehler: ${formatError(err)}`, true);
      input.value = room.capacity ?? '';
    }
  });
  td.appendChild(input);
  return td;
}

function roomClassroomCell(room, setStatus, clearStatus) {
  const td = document.createElement('td');
  td.className = `${TABLE_CELL_CLASS} text-center`;
  const label = document.createElement('label');
  label.className = 'inline-flex items-center justify-center cursor-pointer';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = checkboxClass();
  checkbox.checked = !!room.is_classroom;
  checkbox.addEventListener('change', async () => {
    setStatus('Speichere…');
    try {
      const updated = await updateRoom(room.id, { is_classroom: checkbox.checked });
      Object.assign(room, updated);
      setStatus('Gespeichert.');
      setTimeout(clearStatus, 1500);
    } catch (err) {
      setStatus(`Fehler: ${formatError(err)}`, true);
      checkbox.checked = !!room.is_classroom;
    }
  });
  label.appendChild(checkbox);
  td.appendChild(label);
  return td;
}

function roomActionCell(room, setStatus, clearStatus, reload) {
  const td = document.createElement('td');
  td.className = `${TABLE_CELL_CLASS} text-right`;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `${buttonClass('ghost', 'sm')} text-red-600 hover:text-red-700 focus:ring-red-500/40`;
  btn.textContent = 'Löschen';
  btn.addEventListener('click', async () => {
    const confirmed = await confirmModal({
      title: 'Raum löschen',
      message: `Raum "${room.name}" wirklich löschen?`,
      confirmText: 'Löschen',
    });
    if (!confirmed) return;
    setStatus('Lösche Raum…');
    try {
      await deleteRoom(room.id);
      await reload();
      setStatus('Raum gelöscht.');
      setTimeout(clearStatus, 1500);
    } catch (err) {
      setStatus(`Fehler: ${formatError(err)}`, true);
    }
  });
  td.appendChild(btn);
  return td;
}

function newRoomRow(onRefresh, setStatus, clearStatus) {
  const tr = document.createElement('tr');
  tr.className = `${TABLE_ROW_CLASS} bg-blue-50/40`;

  const draft = {
    name: '',
    type: '',
    capacity: '',
    is_classroom: false,
  };

  const nameCell = document.createElement('td');
  nameCell.className = TABLE_CELL_CLASS;
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = inputClass('sm');
  nameInput.placeholder = 'Raumname*';
  nameInput.addEventListener('input', () => {
    draft.name = nameInput.value.trim();
    updateButtonState();
  });
  nameCell.appendChild(nameInput);
  tr.appendChild(nameCell);

  const typeCell = document.createElement('td');
  typeCell.className = TABLE_CELL_CLASS;
  const typeInput = document.createElement('input');
  typeInput.type = 'text';
  typeInput.className = inputClass('sm');
  typeInput.placeholder = 'Typ';
  typeInput.addEventListener('input', () => {
    draft.type = typeInput.value.trim();
  });
  typeCell.appendChild(typeInput);
  tr.appendChild(typeCell);

  const capacityCell = document.createElement('td');
  capacityCell.className = TABLE_CELL_CLASS;
  const capacityInput = document.createElement('input');
  capacityInput.type = 'number';
  capacityInput.min = '0';
  capacityInput.className = `${inputClass('sm')} w-24`;
  capacityInput.placeholder = '0';
  capacityInput.addEventListener('input', () => {
    draft.capacity = capacityInput.value;
  });
  capacityCell.appendChild(capacityInput);
  tr.appendChild(capacityCell);

  const classroomCell = document.createElement('td');
  classroomCell.className = `${TABLE_CELL_CLASS} text-center`;
  const label = document.createElement('label');
  label.className = 'inline-flex items-center justify-center cursor-pointer';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = checkboxClass();
  checkbox.addEventListener('change', () => {
    draft.is_classroom = checkbox.checked;
  });
  label.appendChild(checkbox);
  classroomCell.appendChild(label);
  tr.appendChild(classroomCell);

  const actionCell = document.createElement('td');
  actionCell.className = `${TABLE_CELL_CLASS} text-right`;
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = buttonClass('primary', 'sm');
  addBtn.textContent = 'Anlegen';
  addBtn.disabled = true;
  addBtn.addEventListener('click', async () => {
    addBtn.disabled = true;
    setStatus('Raum wird angelegt…');
    try {
      const payload = {
        name: draft.name,
        type: draft.type || null,
        capacity: draft.capacity === '' ? null : Number(draft.capacity),
        is_classroom: draft.is_classroom,
      };
      await createRoom(payload);
      nameInput.value = '';
      typeInput.value = '';
      capacityInput.value = '';
      checkbox.checked = false;
      draft.name = '';
      draft.type = '';
      draft.capacity = '';
      draft.is_classroom = false;
      await onRefresh();
      setStatus('Raum angelegt.');
      setTimeout(clearStatus, 1500);
    } catch (err) {
      setStatus(`Fehler: ${formatError(err)}`, true);
    } finally {
      addBtn.disabled = false;
      updateButtonState();
    }
  });
  actionCell.appendChild(addBtn);
  tr.appendChild(actionCell);

  function updateButtonState() {
    addBtn.disabled = !(draft.name && draft.name.length >= 1);
  }

  return tr;
}

// --- Stundentafel ---
function createCurriculumSection(context = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'space-y-3';

  const status = createStatusBar();

  const table = createTable([]);
  wrap.appendChild(table.wrapper);

  const state = {
    classes: [],
    subjects: [],
    subjectsMap: new Map(),
    entries: new Map(),
  };

  const setStatus = status.set;
  const clearStatus = status.clear;

  function normalizeCurriculumEntry(entry = {}) {
    return {
      ...entry,
      participation: entry.participation || 'curriculum',
      doppelstunde: entry.doppelstunde || null,
      nachmittag: entry.nachmittag || null,
    };
  }

  function getClassTotals(classId) {
    let mandatory = 0;
    let optional = 0;
    state.entries.forEach(entry => {
      if (entry?.class_id !== classId) return;
      const hours = entry?.wochenstunden || 0;
      const participation = entry?.participation || 'curriculum';
      if (participation === 'ag') {
        optional += hours;
      } else {
        mandatory += hours;
      }
    });
    return { mandatory, optional };
  }

  function updateClassTotalDisplay(classId) {
    if (classId == null) return;
    const selector = `[data-class-total="${String(classId)}"]`;
    const badge = table.wrapper.querySelector(selector);
    if (!badge) return;
    const { mandatory, optional } = getClassTotals(classId);
    badge.textContent = optional > 0 ? `${mandatory} h (+${optional} h AG)` : `${mandatory} h`;
  }

  async function loadData() {
    setStatus('Lade Stundentafel…');
    try {
      const [classes, subjects, curriculum] = await Promise.all([
        fetchClasses(),
        fetchSubjects(),
        fetchCurriculum(),
      ]);
      state.classes = classes.sort((a, b) => a.name.localeCompare(b.name));
      state.subjects = subjects.sort((a, b) => a.name.localeCompare(b.name));
      state.subjectsMap = new Map(state.subjects.map(sub => [sub.id, sub]));
      state.entries = new Map(curriculum.map(entry => {
        const normalized = normalizeCurriculumEntry(entry);
        return [`${normalized.class_id}|${normalized.subject_id}`, normalized];
      }));
      renderTable();
      setStatus('Stundentafel geladen.');
      setTimeout(clearStatus, 2000);
    } catch (err) {
      setStatus(`Fehler beim Laden: ${formatError(err)}`, true);
    }
  }

  function renderTable() {
    table.thead.innerHTML = '';
    table.tbody.innerHTML = '';

    const headerRow = document.createElement('tr');
    headerRow.className = TABLE_HEAD_ROW_CLASS;

    const subjectHeader = document.createElement('th');
    subjectHeader.className = TABLE_HEAD_CELL_CLASS;
    const subjectLabel = document.createElement('span');
    subjectLabel.className = 'text-xs font-semibold uppercase tracking-wide text-gray-500';
    subjectLabel.textContent = 'Fach';
    subjectHeader.appendChild(subjectLabel);
    headerRow.appendChild(subjectHeader);

    state.classes.forEach(cls => {
      const th = document.createElement('th');
      th.className = 'align-bottom';

      const wrapper = document.createElement('div');
      wrapper.className = 'flex flex-col gap-2 items-stretch text-left';

      const totalBadge = document.createElement('span');
      totalBadge.className = 'inline-flex items-center self-start rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600';
      totalBadge.dataset.classTotal = String(cls.id);
      const totals = getClassTotals(cls.id);
      totalBadge.textContent = totals.optional > 0 ? `${totals.mandatory} h (+${totals.optional} h AG)` : `${totals.mandatory} h`;

      const label = document.createElement('span');
      label.className = 'text-xs uppercase tracking-wide text-gray-500';
      label.textContent = cls.name;

      wrapper.append(totalBadge, label);
      th.appendChild(wrapper);
      headerRow.appendChild(th);
    });
    table.thead.appendChild(headerRow);

    state.subjects.forEach(sub => {
      const tr = document.createElement('tr');
      tr.className = TABLE_ROW_CLASS;
      const subjectCell = document.createElement('td');
      subjectCell.className = TABLE_CELL_CLASS;
      subjectCell.innerHTML = `<div class="flex items-center gap-2"><span class="font-semibold">${sub.kuerzel || sub.name}</span><span class="text-xs opacity-60">${sub.name}</span></div>`;
      tr.appendChild(subjectCell);

      state.classes.forEach(cls => {
        tr.appendChild(curriculumEditableCell(cls.id, sub.id));
      });

      table.tbody.appendChild(tr);
    });
  }

  function curriculumEditableCell(classId, subjectId) {
    const td = document.createElement('td');
    td.className = TABLE_CELL_CLASS;
    const key = `${classId}|${subjectId}`;
    let entry = state.entries.get(key);

    function syncFromState() {
      entry = state.entries.get(key);
      const participationValue = entry?.participation || 'curriculum';
      detailBtn.textContent = participationLabel(participationValue);
      detailBtn.disabled = !entry;
      if (!entry && deleteBtn) deleteBtn.disabled = true;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'flex items-center gap-2';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.className = `${inputClass('sm')} w-20`;
    input.value = entry?.wochenstunden ?? '';
    input.placeholder = '0';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = `${buttonClass('ghost', 'xs')} text-red-600 hover:text-red-700 focus:ring-red-500/40`;
    deleteBtn.textContent = 'Löschen';
    deleteBtn.title = 'Eintrag löschen';
    deleteBtn.disabled = !entry;

    const detailBtn = document.createElement('button');
    detailBtn.type = 'button';
    detailBtn.className = `${buttonClass('outline', 'xs')} whitespace-nowrap`;
    const participationLabel = value => (value === 'ag' ? 'Freiwillig' : 'Pflicht');
    detailBtn.textContent = participationLabel(entry?.participation || 'curriculum');
    detailBtn.disabled = !entry;

    let suppressBlur = false;

    input.addEventListener('blur', () => {
      if (suppressBlur) {
        suppressBlur = false;
        return;
      }
      const currentEntry = state.entries.get(key);
      const participationValue = currentEntry?.participation || entry?.participation || 'curriculum';
      handleCurriculumChange(key, { hoursRaw: input.value, participation: participationValue }, {
        input,
        deleteBtn,
        onParticipationUpdate: value => {
          detailBtn.textContent = participationLabel(value);
          detailBtn.disabled = false;
          syncFromState();
        },
      });
    });

    input.addEventListener('keydown', evt => {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        input.blur();
      }
    });

    deleteBtn.addEventListener('mousedown', () => {
      suppressBlur = true;
    });

    deleteBtn.addEventListener('click', async () => {
      suppressBlur = false;
      const confirmed = await confirmModal({
        title: 'Eintrag löschen',
        message: 'Eintrag wirklich löschen?',
        confirmText: 'Löschen',
      });
      if (!confirmed) return;
      await handleCurriculumDelete(key, {
        input,
        deleteBtn,
        onParticipationUpdate: value => {
          detailBtn.textContent = participationLabel(value);
          detailBtn.disabled = true;
        },
      });
      syncFromState();
    });

    detailBtn.addEventListener('click', () => {
      openCurriculumParticipationModal(classId, subjectId, {
        input,
        deleteBtn,
        updateLabel: value => {
          detailBtn.textContent = participationLabel(value);
          detailBtn.disabled = false;
          syncFromState();
        },
      });
    });

    syncFromState();
    wrapper.append(input, detailBtn, deleteBtn);
    td.appendChild(wrapper);
    return td;
  }

  function openCurriculumParticipationModal(classId, subjectId, context = {}) {
    const key = `${classId}|${subjectId}`;
    const entry = state.entries.get(key);
    if (!entry) return;

    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4';

    const modal = document.createElement('div');
    modal.className = 'w-full max-w-sm rounded-2xl bg-white shadow-xl p-5 space-y-4';
    overlay.appendChild(modal);

    const title = document.createElement('h3');
    title.className = 'text-base font-semibold text-gray-900';
    title.textContent = 'Teilnahme konfigurieren';
    modal.appendChild(title);

    const description = document.createElement('p');
    description.className = 'text-xs text-gray-500';
    description.textContent = 'Lege fest, ob dieser Eintrag zur Pflichtstundenplanung gehört oder freiwillig als AG/Förder zählt.';
    modal.appendChild(description);

    const optionsWrap = document.createElement('div');
    optionsWrap.className = 'space-y-2';

    const current = entry.participation || 'curriculum';
    let selected = current;

    CURRICULUM_PARTICIPATION_OPTIONS.forEach(opt => {
      const item = document.createElement('label');
      item.className = 'flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:border-blue-300 hover:bg-blue-50';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'curriculum-participation';
      radio.value = opt.value;
      radio.checked = opt.value === current;
      radio.className = checkboxClass();
      radio.addEventListener('change', () => {
        selected = radio.value || 'curriculum';
      });
      const label = document.createElement('span');
      label.textContent = opt.label;
      item.append(radio, label);
      optionsWrap.appendChild(item);
    });

    modal.appendChild(optionsWrap);

    const actions = document.createElement('div');
    actions.className = 'flex items-center justify-end gap-2';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = buttonClass('ghost', 'sm');
    cancelBtn.textContent = 'Abbrechen';
    cancelBtn.addEventListener('click', () => overlay.remove());

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = buttonClass('primary', 'sm');
    saveBtn.textContent = 'Übernehmen';
    saveBtn.addEventListener('click', async () => {
      await handleCurriculumChange(key, { hoursRaw: context.input?.value ?? entry.wochenstunden ?? '', participation: selected }, {
        input: context.input,
        deleteBtn: context.deleteBtn,
        onParticipationUpdate: value => {
          context.updateLabel?.(value);
        },
      });
      overlay.remove();
    });

    actions.append(cancelBtn, saveBtn);
    modal.appendChild(actions);

    overlay.addEventListener('click', event => {
      if (event.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
  }

  async function handleCurriculumChange(key, payload, controls) {
    const current = state.entries.get(key);
    const hoursRaw = payload?.hoursRaw ?? (current?.wochenstunden ?? '');
    const participation = payload?.participation || current?.participation || 'curriculum';
    const trimmed = (hoursRaw ?? '').toString().trim();

    if (trimmed === '') {
      await handleCurriculumDelete(key, controls);
      return;
    }

    const value = Number(trimmed);
    if (Number.isNaN(value) || value <= 0) {
      if (controls?.input) {
        controls.input.value = current?.wochenstunden ?? '';
      }
      if (controls?.participationSelect && current) {
        controls.participationSelect.value = current.participation || 'curriculum';
      }
      return;
    }

    const [classId, subjectId] = key.split('|').map(Number);

    if (current) {
      const currentParticipation = current.participation || 'curriculum';
      const needsHoursUpdate = current.wochenstunden !== value;
      const needsParticipationUpdate = currentParticipation !== participation;
      if (!needsHoursUpdate && !needsParticipationUpdate) return;

      const updatePayload = {};
      if (needsHoursUpdate) updatePayload.wochenstunden = value;
      if (needsParticipationUpdate) updatePayload.participation = participation;

      setStatus('Aktualisiere Eintrag…');
      try {
        const updated = await updateCurriculum(current.id, updatePayload);
        const normalized = normalizeCurriculumEntry(updated || { ...current, wochenstunden: value, participation });
        state.entries.set(key, normalized);
        if (controls?.deleteBtn) controls.deleteBtn.disabled = false;
        controls?.onParticipationUpdate?.(normalized.participation);
        if (controls?.input) controls.input.value = normalized.wochenstunden ?? '';
        if (controls?.participationSelect) {
          controls.participationSelect.value = normalized.participation || 'curriculum';
        }
        setStatus('Aktualisiert.');
        updateClassTotalDisplay(normalized.class_id ?? current.class_id ?? classId);
        setTimeout(clearStatus, 1500);
      } catch (err) {
        setStatus(`Fehler: ${formatError(err)}`, true);
        if (controls?.input) controls.input.value = current.wochenstunden ?? '';
        if (controls?.participationSelect) {
          controls.participationSelect.value = currentParticipation;
        }
        controls?.onParticipationUpdate?.(currentParticipation);
      }
    } else {
      setStatus('Lege Eintrag an…');
      try {
        const created = await createCurriculum({
          class_id: classId,
          subject_id: subjectId,
          wochenstunden: value,
          participation,
        });
        const normalized = normalizeCurriculumEntry(created);
        state.entries.set(key, normalized);
        if (controls?.deleteBtn) controls.deleteBtn.disabled = false;
        controls?.onParticipationUpdate?.(normalized.participation);
        if (controls?.participationSelect) {
          controls.participationSelect.value = normalized.participation || 'curriculum';
        }
        setStatus('Eintrag angelegt.');
        updateClassTotalDisplay(classId);
        setTimeout(clearStatus, 1500);
      } catch (err) {
        setStatus(`Fehler: ${formatError(err)}`, true);
        if (controls?.input) controls.input.value = '';
        controls?.onParticipationUpdate?.('curriculum');
        if (controls?.participationSelect) {
          controls.participationSelect.value = 'curriculum';
        }
      }
    }
  }

  async function handleCurriculumDelete(key, controls) {
    const current = state.entries.get(key);
    if (!current) {
      if (controls?.input) controls.input.value = '';
      if (controls?.deleteBtn) controls.deleteBtn.disabled = true;
      controls?.onParticipationUpdate?.('curriculum');
      if (controls?.participationSelect) {
        controls.participationSelect.value = 'curriculum';
      }
      return;
    }
    setStatus('Lösche Eintrag…');
    try {
      await deleteCurriculum(current.id);
      state.entries.delete(key);
      if (controls?.input) controls.input.value = '';
      if (controls?.deleteBtn) controls.deleteBtn.disabled = true;
      controls?.onParticipationUpdate?.('curriculum');
      if (controls?.participationSelect) {
        controls.participationSelect.value = 'curriculum';
      }
      setStatus('Eintrag gelöscht.');
      updateClassTotalDisplay(current.class_id);
      setTimeout(clearStatus, 1500);
    } catch (err) {
      setStatus(`Fehler: ${formatError(err)}`, true);
      if (controls?.input) controls.input.value = current.wochenstunden ?? '';
      if (controls?.deleteBtn) controls.deleteBtn.disabled = false;
      controls?.onParticipationUpdate?.(current.participation || 'curriculum');
      if (controls?.participationSelect) {
        controls.participationSelect.value = current.participation || 'curriculum';
      }
    }
  }

  loadData();
  return {
    element: wrap,
    destroy() {
      status.destroy();
    },
  };
}

// --- Helper ---
function createStatusBar() {
  const element = document.createElement('div');
  element.className = 'fixed bottom-6 right-6 z-[95] hidden';
  element.style.pointerEvents = 'none';
  document.body.appendChild(element);

  let hideTimer = null;

  function show(message, error = false) {
    clearTimeout(hideTimer);
    const toneClass = error
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-green-200 bg-green-50 text-green-700';
    element.innerHTML = `
      <div class="pointer-events-auto rounded-xl border ${toneClass} px-4 py-3 shadow-lg text-sm font-medium max-w-sm">
        ${message || ''}
      </div>
    `;
    element.classList.remove('hidden');
    hideTimer = setTimeout(() => {
      element.classList.add('hidden');
      element.innerHTML = '';
    }, 2000);
  }

  function clear() {
    clearTimeout(hideTimer);
    element.classList.add('hidden');
    element.innerHTML = '';
  }

  function destroy() {
    clearTimeout(hideTimer);
    if (element.parentElement) {
      element.parentElement.removeChild(element);
    }
  }

  return {
    element,
    set: show,
    clear,
    destroy,
  };
}

function createTable(headers) {
  const wrapper = document.createElement('div');
  wrapper.className = TABLE_WRAPPER_CLASS;

  const table = document.createElement('table');
  table.className = TABLE_CLASS;
  wrapper.appendChild(table);

  const thead = document.createElement('thead');
  if (headers.length) {
    const tr = document.createElement('tr');
    tr.className = TABLE_HEAD_ROW_CLASS;
    headers.forEach(label => tr.appendChild(createHeaderCell(label)));
    thead.appendChild(tr);
  }
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  table.appendChild(tbody);

  return { wrapper, table, thead, tbody };
}

function createHeaderCell(label) {
  const th = document.createElement('th');
  th.className = TABLE_HEAD_CELL_CLASS;
  th.textContent = label;
  return th;
}

function normalizeValue(type, value) {
  if (type === 'number') {
    if (value === '') return null;
    const num = Number(value);
    return Number.isNaN(num) ? null : num;
  }
  return value.trim();
}

function normalizeColorValue(color) {
  return normalizeTeacherColor(color) || DEFAULT_TEACHER_BADGE_COLOR;
}

function buildTeacherName(teacher) {
  const first = teacher.first_name ? String(teacher.first_name).trim() : '';
  const last = teacher.last_name ? String(teacher.last_name).trim() : '';
  const full = `${first} ${last}`.trim();
  return full || teacher.kuerzel || teacher.name || '';
}

function buildTeacherUpdatePayload(teacher, overrides = {}) {
  const base = {
    first_name: teacher.first_name ?? null,
    last_name: teacher.last_name ?? null,
    kuerzel: teacher.kuerzel ?? null,
    deputat_soll: typeof teacher.deputat_soll === 'number' ? teacher.deputat_soll : null,
    deputat: typeof teacher.deputat === 'number' ? teacher.deputat : null,
    work_mo: teacher.work_mo ?? true,
    work_di: teacher.work_di ?? true,
    work_mi: teacher.work_mi ?? true,
    work_do: teacher.work_do ?? true,
    work_fr: teacher.work_fr ?? true,
    color: teacher.color ? normalizeColorValue(teacher.color) : null,
  };
  const merged = { ...base, ...overrides };
  const nameSource = { ...teacher, ...merged };
  merged.name = buildTeacherName(nameSource);
  return merged;
}

function buildCreateTeacher(draft) {
  const deputatSollValue = Number.isFinite(draft.deputat_soll) ? Number(draft.deputat_soll) : null;
  const deputatValue = Number.isFinite(draft.deputat) ? Number(draft.deputat) : deputatSollValue;
  return {
    first_name: draft.first_name?.trim() || null,
    last_name: draft.last_name?.trim() || null,
    kuerzel: draft.kuerzel?.trim(),
    deputat_soll: deputatSollValue,
    deputat: deputatValue,
    work_mo: draft.work_mo,
    work_di: draft.work_di,
    work_mi: draft.work_mi,
    work_do: draft.work_do,
    work_fr: draft.work_fr,
    name: buildTeacherName(draft),
    color: normalizeColorValue(draft.color),
  };
}
