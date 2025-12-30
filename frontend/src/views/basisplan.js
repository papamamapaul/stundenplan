import { fetchClasses } from '../api/classes.js';
import { fetchSubjects } from '../api/subjects.js';
import { fetchCurriculum } from '../api/curriculum.js';
import { fetchBasisplan, updateBasisplan } from '../api/basisplan.js';
import { fetchRooms } from '../api/rooms.js';
import { confirmModal, formatError } from '../utils/ui.js';
import { getActivePlanningPeriod } from '../store/planningPeriods.js';
import { createIcon, ICONS } from '../components/icons.js';

const DAYS = [
  { key: 'mon', label: 'Montag' },
  { key: 'tue', label: 'Dienstag' },
  { key: 'wed', label: 'Mittwoch' },
  { key: 'thu', label: 'Donnerstag' },
  { key: 'fri', label: 'Freitag' },
];

const DEFAULT_SLOTS = [
  { id: 'slot-1', label: '1. Stunde', start: '08:00', end: '08:45', isPause: false },
  { id: 'slot-2', label: '2. Stunde', start: '08:50', end: '09:35', isPause: false },
  { id: 'slot-3', label: '3. Stunde', start: '09:50', end: '10:35', isPause: false },
  { id: 'slot-4', label: '4. Stunde', start: '10:40', end: '11:25', isPause: false },
  { id: 'slot-5', label: '5. Stunde', start: '11:30', end: '12:15', isPause: false },
  { id: 'slot-6', label: '6. Stunde', start: '12:20', end: '13:05', isPause: false },
  { id: 'slot-7', label: '7. Stunde', start: '13:30', end: '14:15', isPause: false },
  { id: 'slot-8', label: '8. Stunde', start: '14:20', end: '15:05', isPause: false },
];

const DEFAULT_META = { version: 1, flexCounter: 1, slotCounter: DEFAULT_SLOTS.length + 1 };
const DEFAULT_KEY = '__all';

let basisplanStylesInjected = false;
function ensureBasisplanStyles() {
  if (basisplanStylesInjected) return;
  const style = document.createElement('style');
  style.textContent = `
  .basis-grid {
    background: var(--b1);
  }
  .basis-grid__sticky-col {
    position: sticky;
    left: 0;
    z-index: 5;
    background: var(--b1);
  }
  .basis-grid__sticky-corner {
    position: sticky;
    left: 0;
    top: 0;
    z-index: 6;
    background: var(--b1);
  }
  .basis-grid__sticky-top {
    position: sticky;
    top: 0;
    z-index: 4;
    background: var(--b1);
  }
  .basis-grid__sticky-top.basis-grid__sticky-col {
    z-index: 7;
  }
  .basis-slot-cell {
    transition: background-color 120ms ease;
  }
  .basis-slot-cell.bg-base-200 {
    opacity: 0.7;
  }
  .basis-grid__pending-target {
    outline: 2px dashed var(--p);
    outline-offset: -2px;
    cursor: copy;
  }
  `;
  document.head.appendChild(style);
  basisplanStylesInjected = true;
}

export function createBasisplanView() {
  ensureBasisplanStyles();
  const container = document.createElement('section');
  container.className = 'h-full';

  const layout = document.createElement('div');
  layout.className = 'flex h-full min-h-[calc(100vh-180px)] rounded-2xl border border-gray-200 bg-gray-50 shadow-sm overflow-hidden';
  container.appendChild(layout);

  // Sidebar
  const sidebar = document.createElement('aside');
  sidebar.className = 'w-80 bg-white border-r border-gray-200 flex flex-col';
  layout.appendChild(sidebar);

  const paletteHeader = document.createElement('div');
  paletteHeader.className = 'p-4 border-b border-gray-200 space-y-3';
  sidebar.appendChild(paletteHeader);

  const paletteTitleRow = document.createElement('div');
  paletteTitleRow.className = 'flex items-center justify-between';
  const paletteTitle = document.createElement('h3');
  paletteTitle.className = 'text-base font-semibold text-gray-900';
  paletteTitle.textContent = 'Fächer-Palette';
  const paletteCountLabel = document.createElement('span');
  paletteCountLabel.className = 'text-xs text-gray-500';
  paletteCountLabel.textContent = '0 Fächer';
  paletteTitleRow.append(paletteTitle, paletteCountLabel);
  paletteHeader.appendChild(paletteTitleRow);

  const paletteSearchWrap = document.createElement('div');
  paletteSearchWrap.className = 'relative';
  const paletteSearchInput = document.createElement('input');
  paletteSearchInput.type = 'search';
  paletteSearchInput.placeholder = 'Fach suchen…';
  paletteSearchInput.className = 'w-full rounded-lg border border-gray-200 px-3 py-2 pl-9 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40';
  const searchIcon = document.createElement('span');
  searchIcon.className = 'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400';
  searchIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
  paletteSearchWrap.append(paletteSearchInput, searchIcon);
  paletteHeader.appendChild(paletteSearchWrap);

  const classSelect = document.createElement('select');
  classSelect.className = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40';
  paletteHeader.appendChild(classSelect);

  const roomSelect = document.createElement('select');
  roomSelect.className = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 hidden';
  paletteHeader.appendChild(roomSelect);

  const paletteContainer = document.createElement('div');
  paletteContainer.className = 'flex-1 overflow-y-auto p-4 space-y-2';
  sidebar.appendChild(paletteContainer);

  const paletteFooter = document.createElement('div');
  paletteFooter.className = 'border-t border-gray-200 bg-gray-50 p-4 text-xs text-gray-600';
  paletteFooter.innerHTML = '<div class="flex items-start gap-2"><span class="mt-0.5 inline-flex h-4 w-4 items-center justify-center text-gray-400"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><circle cx="5" cy="5" r="1"></circle><circle cx="5" cy="12" r="1"></circle><circle cx="5" cy="19" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="19" r="1"></circle><circle cx="19" cy="5" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="19" cy="19" r="1"></circle></svg></span><span>Ziehe Fächer auf den Stundenplan, um fixe Stunden oder Optionen zu vergeben. Ein Klick auf einen Slot öffnet die Details.</span></div>';
  sidebar.appendChild(paletteFooter);

  // Main content
  const main = document.createElement('div');
  main.className = 'flex-1 flex flex-col';
  layout.appendChild(main);

  const mainHeader = document.createElement('div');
  mainHeader.className = 'bg-white border-b border-gray-200 px-6 py-4';
  main.appendChild(mainHeader);

  const headerRow = document.createElement('div');
  headerRow.className = 'flex flex-wrap items-center justify-between gap-4';
  mainHeader.appendChild(headerRow);

  const headerLeft = document.createElement('div');
  headerLeft.className = 'space-y-1';
  const mainTitle = document.createElement('h2');
  mainTitle.className = 'text-xl font-semibold text-gray-900';
  mainTitle.textContent = 'Basisplan';
  const mainContext = document.createElement('p');
  mainContext.className = 'text-sm text-gray-600';
  const periodLabel = document.createElement('p');
  periodLabel.className = 'text-xs text-gray-400';
  const activePeriod = getActivePlanningPeriod();
  periodLabel.textContent = activePeriod ? `Planungsperiode: ${activePeriod.name}` : 'Keine Planungsperiode gewählt';
  headerLeft.append(mainTitle, mainContext, periodLabel);
  headerRow.appendChild(headerLeft);

  const headerActions = document.createElement('div');
  headerActions.className = 'flex flex-wrap items-center justify-end gap-3';
  headerRow.appendChild(headerActions);

  const viewSwitch = document.createElement('div');
  viewSwitch.className = 'inline-flex rounded-full bg-gray-100 p-1';
  const btnClassesView = document.createElement('button');
  btnClassesView.type = 'button';
  btnClassesView.className = 'px-3 py-1 text-xs font-semibold rounded-full';
  btnClassesView.textContent = 'Klassen';
  const btnRoomsView = document.createElement('button');
  btnRoomsView.type = 'button';
  btnRoomsView.className = 'px-3 py-1 text-xs font-semibold rounded-full';
  btnRoomsView.textContent = 'Räume';
  viewSwitch.append(btnClassesView, btnRoomsView);
  headerActions.appendChild(viewSwitch);

  const modeToggle = document.createElement('div');
  modeToggle.className = 'flex items-center gap-2 rounded-lg bg-gray-100 p-1';
  const modeFixBtn = document.createElement('button');
  modeFixBtn.type = 'button';
  modeFixBtn.className = 'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors';
  const modeFixIconWrap = document.createElement('span');
  modeFixIconWrap.className = 'inline-flex h-4 w-4 items-center justify-center';
  modeFixIconWrap.appendChild(createIcon(ICONS.LOCK, { size: 16 }));
  const modeFixLabel = document.createElement('span');
  modeFixLabel.textContent = 'Fix';
  modeFixBtn.append(modeFixIconWrap, modeFixLabel);
  const modeOptionBtn = document.createElement('button');
  modeOptionBtn.type = 'button';
  modeOptionBtn.className = 'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors';
  const modeOptionIconWrap = document.createElement('span');
  modeOptionIconWrap.className = 'inline-flex h-4 w-4 items-center justify-center';
  modeOptionIconWrap.appendChild(createIcon(ICONS.UNLOCK, { size: 16 }));
  const modeOptionLabel = document.createElement('span');
  modeOptionLabel.textContent = 'Option';
  modeOptionBtn.append(modeOptionIconWrap, modeOptionLabel);
  modeToggle.append(modeFixBtn, modeOptionBtn);
  headerActions.appendChild(modeToggle);

  const openHoursWrap = document.createElement('div');
  openHoursWrap.className = 'flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm text-gray-600 shadow-sm';
  openHoursWrap.innerHTML = '<span class="inline-flex h-4 w-4 items-center justify-center text-gray-400"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></span><span>Offen:</span>';
  const openHoursValue = document.createElement('span');
  openHoursValue.className = 'font-semibold text-orange-600';
  openHoursValue.textContent = '0h';
  openHoursWrap.appendChild(openHoursValue);
  headerActions.appendChild(openHoursWrap);

  const addSlotButton = document.createElement('button');
  addSlotButton.type = 'button';
  addSlotButton.className = 'inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500';
  addSlotButton.innerHTML = '<span class="inline-flex h-4 w-4 items-center justify-center text-white"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></span><span>Slot anlegen</span>';
  headerActions.appendChild(addSlotButton);

  const gridScroll = document.createElement('div');
  gridScroll.className = 'flex-1 overflow-auto px-6 py-4';
  main.appendChild(gridScroll);

  const gridContainer = document.createElement('div');
  gridContainer.className = 'overflow-x-auto';
  gridScroll.appendChild(gridContainer);

  const legend = document.createElement('div');
  legend.className = 'border-t border-gray-200 bg-white px-6 py-3 text-xs text-gray-600';
  const legendList = document.createElement('div');
  legendList.className = 'flex flex-wrap items-center gap-4';
  const createLegendItem = ({ badgeClass, iconName, label }) => {
    const entry = document.createElement('div');
    entry.className = 'flex items-center gap-2';
    const badge = document.createElement('span');
    badge.className = badgeClass;
    if (iconName) {
      badge.appendChild(createIcon(iconName, { size: 14 }));
    }
    entry.append(badge, document.createTextNode(label));
    return entry;
  };
  legendList.append(
    createLegendItem({
      badgeClass: 'inline-flex h-5 w-7 items-center justify-center rounded border-2 border-yellow-400 bg-yellow-100 text-yellow-700',
      iconName: ICONS.LOCK,
      label: 'Fixe Stunde (gesperrt)',
    }),
    createLegendItem({
      badgeClass: 'inline-flex h-5 w-7 items-center justify-center rounded border-2 border-blue-400 bg-blue-100 text-blue-700',
      iconName: ICONS.UNLOCK,
      label: 'Option / Range',
    }),
    createLegendItem({
      badgeClass: 'inline-flex h-5 w-7 items-center justify-center rounded border border-gray-200 bg-gray-100',
      iconName: null,
      label: 'Pause / frei',
    }),
    createLegendItem({
      badgeClass: 'inline-flex h-5 w-7 items-center justify-center rounded border border-gray-300 bg-white text-gray-600',
      iconName: ICONS.BAN,
      label: 'Zeitfenster gesperrt',
    })
  );
  legend.appendChild(legendList);
  main.appendChild(legend);

  const status = createStatusBar();

  const state = {
    loading: false,
    classes: [],
    rooms: [],
    subjects: new Map(),
    curriculum: new Map(), // classId -> Map(subjectId -> totalHours)
    remaining: new Map(), // classId -> Map(subjectId -> remainingHours)
    slots: DEFAULT_SLOTS.map(slot => ({ ...slot })),
    windows: {},
    roomWindows: {},
    fixed: {},
    flexible: {},
    rawData: { meta: { ...DEFAULT_META }, windows: {}, fixed: {}, flexible: {}, rooms: {}, classes: {} },
    selectedClassId: 'all',
    selectedRoomId: null,
    saveTimer: null,
    saving: false,
    assignmentMode: 'fixed',
    viewMode: 'classes',
    pendingRange: null,
    paletteSearchTerm: '',
  };

  function updateModeButtons() {
    if (state.assignmentMode === 'fixed') {
      modeFixBtn.classList.add('bg-yellow-100', 'text-yellow-700', 'shadow-sm');
      modeOptionBtn.classList.remove('bg-blue-100', 'text-blue-700', 'shadow-sm');
      modeOptionBtn.classList.add('text-gray-600');
      modeFixBtn.classList.remove('text-gray-600');
    } else {
      modeOptionBtn.classList.add('bg-blue-100', 'text-blue-700', 'shadow-sm');
      modeFixBtn.classList.remove('bg-yellow-100', 'text-yellow-700', 'shadow-sm');
      modeFixBtn.classList.add('text-gray-600');
      modeOptionBtn.classList.remove('text-gray-600');
    }
  }

  function updateViewModeUI() {
    const isRoomMode = state.viewMode === 'rooms';
    btnClassesView.classList.toggle('bg-white', !isRoomMode);
    btnClassesView.classList.toggle('shadow', !isRoomMode);
    btnRoomsView.classList.toggle('bg-white', isRoomMode);
    btnRoomsView.classList.toggle('shadow', isRoomMode);
    btnRoomsView.disabled = state.rooms.length === 0;
    paletteSearchWrap.classList.toggle('hidden', isRoomMode);
    classSelect.classList.toggle('hidden', isRoomMode);
    roomSelect.classList.toggle('hidden', !isRoomMode || !state.rooms.length);
    paletteFooter.classList.toggle('hidden', isRoomMode);
    modeToggle.classList.toggle('hidden', isRoomMode);
    openHoursWrap.classList.toggle('hidden', isRoomMode);
    addSlotButton.classList.toggle('hidden', isRoomMode);
  }

  btnClassesView.addEventListener('click', () => {
    setViewMode('classes');
  });

  btnRoomsView.addEventListener('click', () => {
    if (!state.rooms.length) return;
    setViewMode('rooms');
  });

  function setViewMode(mode) {
    if (state.viewMode === mode) return;
    state.viewMode = mode;
    state.pendingRange = null;
    updateViewModeUI();
    updateHeaderContext();
    renderPalette();
    renderGrid();
    if (mode === 'classes') {
      updateOpenHoursDisplay();
    }
  }

  function updateHeaderContext() {
    if (state.viewMode === 'rooms') {
      const roomMatch = state.rooms.find(room => String(room.id) === state.selectedRoomId);
      if (roomMatch) {
        mainContext.textContent = roomMatch.name || `Raum ${roomMatch.id}`;
      } else {
        mainContext.textContent = 'Raumverfügbarkeit';
      }
      return;
    }
    if (state.selectedClassId === 'all') {
      mainContext.textContent = 'Alle Klassen';
    } else {
      const match = state.classes.find(cls => String(cls.id) === state.selectedClassId);
      if (match?.name) {
        mainContext.textContent = match.name;
      } else {
        mainContext.textContent = `Klasse ${state.selectedClassId}`;
      }
    }
  }

  function updateOpenHoursDisplay() {
    openHoursValue.textContent = `${countRemainingHours()}h`;
  }

  classSelect.addEventListener('change', () => {
    state.selectedClassId = classSelect.value;
    state.pendingRange = null;
    renderPalette();
    renderGrid();
    updateHeaderContext();
  });

  roomSelect.addEventListener('change', () => {
    state.selectedRoomId = roomSelect.value || null;
    renderGrid();
    updateHeaderContext();
  });

  paletteSearchInput.addEventListener('input', () => {
    state.paletteSearchTerm = paletteSearchInput.value;
    renderPalette();
  });

  addSlotButton.addEventListener('click', () => {
    createSlotAndEdit();
  });

  modeFixBtn.addEventListener('click', () => {
    if (state.assignmentMode === 'fixed') return;
    state.assignmentMode = 'fixed';
    state.pendingRange = null;
    updateModeButtons();
    renderPalette();
    renderGrid();
    status.set('Modus: Fixierte Stunden');
    setTimeout(status.clear, 1400);
  });

  modeOptionBtn.addEventListener('click', () => {
    if (state.assignmentMode === 'range') return;
    state.assignmentMode = 'range';
    state.pendingRange = null;
    updateModeButtons();
    renderPalette();
    renderGrid();
    status.set('Modus: Optionen – Slots per Drag & Drop wählen.');
    setTimeout(status.clear, 1400);
  });

  updateModeButtons();
  updateViewModeUI();
  updateHeaderContext();
  updateOpenHoursDisplay();

  function getSlots() {
    if (Array.isArray(state?.slots) && state.slots.length) {
      return state.slots;
    }
    return DEFAULT_SLOTS;
  }

  function defaultAllowedArray() {
    const slots = getSlots();
    return slots.map(slot => !slot?.isPause);
  }

  function ensureWindowsFor(key) {
    const target = state.windows[key] || { allowed: {} };
    if (!target.allowed) target.allowed = {};
    const slots = getSlots();
    const desiredLength = slots.length;
    DAYS.forEach(day => {
      const existing = Array.isArray(target.allowed[day.key]) ? target.allowed[day.key] : [];
      const base = defaultAllowedArray();
      for (let i = 0; i < desiredLength; i += 1) {
        if (slots[i]?.isPause) {
          base[i] = false;
          continue;
        }
        if (typeof existing[i] === 'boolean') {
          base[i] = existing[i];
        }
      }
      target.allowed[day.key] = base;
    });
    state.windows[key] = target;
  }

  function ensureBaseWindows() {
    if (!state.windows[DEFAULT_KEY]) {
      state.windows[DEFAULT_KEY] = { allowed: {} };
    }
    ensureWindowsFor(DEFAULT_KEY);
    state.classes.forEach(cls => {
      const key = String(cls.id);
      if (state.windows[key]) ensureWindowsFor(key);
    });
    state.rawData.windows = deepClone(state.windows);
  }

  function ensureRoomWindowsFor(roomId) {
    const key = String(roomId);
    if (!key || key === 'null' || key === 'undefined') return;
    const target = state.roomWindows[key] || { allowed: {} };
    const slots = getSlots();
    DAYS.forEach(day => {
      const existing = Array.isArray(target.allowed?.[day.key]) ? target.allowed[day.key] : [];
      const base = defaultAllowedArray();
      for (let i = 0; i < slots.length; i += 1) {
        if (slots[i]?.isPause) {
          base[i] = false;
          continue;
        }
        if (typeof existing[i] === 'boolean') {
          base[i] = existing[i];
        }
      }
      target.allowed[day.key] = base;
    });
    state.roomWindows[key] = target;
  }

  function ensureRoomWindowsBase() {
    state.rooms.forEach(room => {
      ensureRoomWindowsFor(room.id);
    });
    state.rawData.rooms = deepClone(state.roomWindows);
  }

  function isSlotAllowed(classId, dayKey, slotIndex) {
    const slots = getSlots();
    const slot = slots[slotIndex];
    if (!slot || slot?.isPause) {
      return false;
    }
    const classKey = String(classId);
    const specific = state.windows[classKey];
    if (specific?.allowed?.[dayKey]) {
      const value = specific.allowed[dayKey][slotIndex];
      if (typeof value === 'boolean') return value;
    }
    const base = state.windows[DEFAULT_KEY];
    if (base?.allowed?.[dayKey]) {
      const value = base.allowed[dayKey][slotIndex];
      if (typeof value === 'boolean') return value;
    }
    return true;
  }

  function isRoomSlotAllowed(roomId, dayKey, slotIndex) {
    if (!roomId) return true;
    const key = String(roomId);
    const entry = state.roomWindows[key];
    if (entry?.allowed?.[dayKey]) {
      const value = entry.allowed[dayKey][slotIndex];
      if (typeof value === 'boolean') return value;
    }
    return true;
  }

  function setRoomSlotAllowed(roomId, dayKey, slotIndex, value) {
    if (!roomId) return;
    ensureRoomWindowsFor(roomId);
    const key = String(roomId);
    const entry = state.roomWindows[key];
    if (!entry.allowed[dayKey]) {
      entry.allowed[dayKey] = defaultAllowedArray();
    }
    entry.allowed[dayKey][slotIndex] = value;
    state.rawData.rooms = deepClone(state.roomWindows);
    scheduleSave();
  }

  function setSlotAllowed(targetClassId, dayKey, slotIndex, value) {
    const slots = getSlots();
    const slot = slots[slotIndex];
    if (!slot || slot.isPause) {
      status.set('Pausenzeiten können nicht belegt werden.', true);
      setTimeout(status.clear, 1500);
      return;
    }
    const key = state.selectedClassId === 'all' ? DEFAULT_KEY : String(targetClassId);
    ensureWindowsFor(key);
    state.windows[key].allowed[dayKey][slotIndex] = value;
    state.rawData.windows = deepClone(state.windows);
    scheduleSave();

    if (state.selectedClassId === 'all') {
      renderGrid();
      return;
    }

    const selector = `[data-class-id=\"${targetClassId}\"][data-day=\"${dayKey}\"][data-slot-index=\"${slotIndex}\"]`;
    const cell = gridContainer.querySelector(selector);
    if (cell) {
      cell.setAttribute('data-allowed', value ? '1' : '0');
      cell.classList.toggle('bg-success/10', value);
      cell.classList.toggle('bg-base-200', !value);
      cell.classList.toggle('opacity-50', !value);
    }
  }

  function applySlotChanges(updatedSlots) {
    if (!Array.isArray(updatedSlots) || !updatedSlots.length) {
      return false;
    }
    const oldSlots = Array.isArray(state.slots) ? state.slots.map(slot => ({ ...slot })) : [];
    const oldIdToIndex = new Map(oldSlots.map((slot, index) => [slot.id, index]));

    const sanitized = updatedSlots.map((slot, index) => {
      const start = sanitizeTime(slot.start);
      const end = sanitizeTime(slot.end);
      return {
        id: typeof slot.id === 'string' && slot.id.trim() ? slot.id.trim() : `temp-${index}`,
        label: typeof slot.label === 'string' ? slot.label.trim() : '',
        start: start || '08:00',
        end: end || '08:45',
        isPause: Boolean(slot.isPause),
      };
    });

    const unchanged = sanitized.length === oldSlots.length && sanitized.every((slot, index) => {
      const current = oldSlots[index];
      if (!current) return false;
      const currentStart = sanitizeTime(current.start);
      const currentEnd = sanitizeTime(current.end);
      return current.id === slot.id
        && (current.label || '') === (slot.label || '')
        && (currentStart || '') === (slot.start || '')
        && (currentEnd || '') === (slot.end || '')
        && Boolean(current.isPause) === Boolean(slot.isPause);
    });
    if (unchanged) {
      return 'unchanged';
    }

    const seenIds = new Set();
    sanitized.forEach(slot => {
      if (!slot.id.startsWith('slot-') || seenIds.has(slot.id)) {
        slot.id = createSlotId();
      }
      seenIds.add(slot.id);
    });
    const newIdToIndex = new Map(sanitized.map((slot, index) => [slot.id, index]));

    Object.keys(state.windows || {}).forEach(key => {
      const entry = state.windows[key] || {};
      if (!entry.allowed) entry.allowed = {};
      DAYS.forEach(day => {
        const oldArray = Array.isArray(entry.allowed[day.key]) ? entry.allowed[day.key] : [];
        const next = sanitized.map(slot => {
          if (slot.isPause) return false;
          const oldIndex = oldIdToIndex.get(slot.id);
          if (oldIndex != null && typeof oldArray[oldIndex] === 'boolean') {
            return oldArray[oldIndex];
          }
          return true;
        });
        entry.allowed[day.key] = next;
      });
    });

    state.slots = sanitized.map(slot => ({ ...slot }));
    ensureBaseWindows();

    const newFixed = {};
    Object.entries(state.fixed || {}).forEach(([classKey, entries]) => {
      const normalized = [];
      (entries || []).forEach(entry => {
        const oldIndex = Number(entry.slot);
        if (!Number.isFinite(oldIndex)) return;
        const oldSlot = oldSlots[oldIndex];
        if (!oldSlot) return;
        const newIndex = newIdToIndex.get(oldSlot.id);
        if (newIndex == null) return;
        if (state.slots[newIndex]?.isPause) return;
        normalized.push({ ...entry, slot: newIndex });
      });
      newFixed[classKey] = normalized;
    });
    state.fixed = newFixed;
    state.rawData.fixed = deepClone(state.fixed);

    const newFlexible = {};
    Object.entries(state.flexible || {}).forEach(([classKey, groups]) => {
      if (!Array.isArray(groups)) return;
      const mappedGroups = [];
      groups.forEach(group => {
        const slots = Array.isArray(group.slots)
          ? group.slots
            .map(slotRef => {
              const oldIndex = Number(slotRef.slot);
              if (!Number.isFinite(oldIndex)) return null;
              const oldSlot = oldSlots[oldIndex];
              if (!oldSlot) return null;
              const newIndex = newIdToIndex.get(oldSlot.id);
              if (newIndex == null) return null;
              if (state.slots[newIndex]?.isPause) return null;
              return { ...slotRef, slot: newIndex };
            })
            .filter(Boolean)
          : [];
        if (slots.length) {
          mappedGroups.push({ ...group, slots });
        }
      });
      if (mappedGroups.length) {
        newFlexible[classKey] = mappedGroups;
      }
    });
    state.flexible = newFlexible;
    state.rawData.flexible = deepClone(state.flexible);

    state.rawData.windows = deepClone(state.windows);
    state.rawData.meta = state.rawData.meta || { ...DEFAULT_META };
    state.rawData.meta.slots = deepClone(state.slots);
    ensureSlotCounter();

    state.pendingRange = null;
    recomputeRemaining();
    renderPalette();
    renderGrid();
    scheduleSave();
    status.set('Zeitslots aktualisiert.');
    setTimeout(status.clear, 1500);
    return true;
  }

function createSlotAndEdit() {
  const last = state.slots[state.slots.length - 1];
  const lastEnd = last ? sanitizeTime(last.end) : null;
  const startValue = lastEnd || '08:00';
  const endValue = addMinutesToTime(startValue, 45) || startValue;
  const draftSlots = [...state.slots, {
    id: '',
    label: `Slot ${state.slots.length + 1}`,
    start: startValue,
    end: endValue,
    isPause: false,
  }];
  const result = applySlotChanges(draftSlots);
  if (result === true) {
    openSlotModal(state.slots.length - 1);
  }
}

function insertSlotRelative(slotIndex, position = 'after') {
  const slots = getSlots();
  const reference = slots[slotIndex];
  if (!reference) return -1;
  const insertAt = position === 'before' ? slotIndex : slotIndex + 1;
  const newSlot = {
    id: '',
    label: reference.label || `Slot ${insertAt + 1}`,
    start: reference.start,
    end: reference.end,
    isPause: reference.isPause,
  };
  const updated = [...slots.slice(0, insertAt), newSlot, ...slots.slice(insertAt)];
  const result = applySlotChanges(updated);
  if (result === true) {
    return insertAt;
  }
  return -1;
}

function openSlotModal(slotIndex) {
  const slots = getSlots();
  const current = slots[slotIndex];
  if (!current) return;

  const previousPointerEvents = gridContainer.style.pointerEvents;
  const previousFilter = gridContainer.style.filter;
  const previousOpacity = gridContainer.style.opacity;
  gridContainer.style.pointerEvents = 'none';
  gridContainer.style.filter = 'blur(1px) grayscale(0.2)';
  gridContainer.style.opacity = '0.25';

  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950 p-4';

  const modal = document.createElement('div');
  modal.className = 'relative z-[10000] w-full max-w-md rounded-2xl bg-white shadow-2xl';
  overlay.appendChild(modal);

  const header = document.createElement('div');
  header.className = 'flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4';

  const titleWrap = document.createElement('div');
  const title = document.createElement('h2');
  title.className = 'text-lg font-semibold text-gray-900';
  title.textContent = current.label || `Slot ${slotIndex + 1}`;
  const subtitle = document.createElement('p');
  subtitle.className = 'text-xs text-gray-500';
  subtitle.textContent = `Slot ${slotIndex + 1} bearbeiten`;
  titleWrap.append(title, subtitle);
  header.appendChild(titleWrap);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'text-sm text-gray-500 hover:text-gray-700';
  closeBtn.textContent = 'Schließen';
  closeBtn.addEventListener('click', () => closeModal());
  header.appendChild(closeBtn);
  modal.appendChild(header);

  function updateTitle() {
    title.textContent = labelInput.value.trim() || (pauseCheckbox.checked ? 'Pause' : `Slot ${slotIndex + 1}`);
  }

  const body = document.createElement('div');
  body.className = 'space-y-4 px-5 py-5';
  modal.appendChild(body);

  const labelField = document.createElement('div');
  labelField.className = 'space-y-1';
  const labelLabel = document.createElement('label');
  labelLabel.className = 'text-xs font-semibold uppercase tracking-wide text-gray-500';
  labelLabel.textContent = 'Bezeichnung';
  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.className = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40';
  labelInput.value = current.label || '';
  labelInput.addEventListener('input', () => {
    updateTitle();
  });
  labelField.append(labelLabel, labelInput);
  body.appendChild(labelField);

  const timeRow = document.createElement('div');
  timeRow.className = 'grid grid-cols-2 gap-3';
  const startWrap = document.createElement('div');
  startWrap.className = 'space-y-1';
  const startLabel = document.createElement('label');
  startLabel.className = 'text-xs font-semibold uppercase tracking-wide text-gray-500';
  startLabel.textContent = 'Beginn';
  const startInput = document.createElement('input');
  startInput.type = 'time';
  startInput.className = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40';
  startInput.value = sanitizeTime(current.start) || '';
  startWrap.append(startLabel, startInput);
  timeRow.appendChild(startWrap);

  const endWrap = document.createElement('div');
  endWrap.className = 'space-y-1';
  const endLabel = document.createElement('label');
  endLabel.className = 'text-xs font-semibold uppercase tracking-wide text-gray-500';
  endLabel.textContent = 'Ende';
  const endInput = document.createElement('input');
  endInput.type = 'time';
  endInput.className = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40';
  endInput.value = sanitizeTime(current.end) || '';
  endWrap.append(endLabel, endInput);
  timeRow.appendChild(endWrap);
  body.appendChild(timeRow);

  let endTouched = false;
  endInput.addEventListener('input', () => {
    endTouched = true;
  });
  startInput.addEventListener('input', () => {
    const normalized = sanitizeTime(startInput.value);
    if (!normalized) return;
    const suggestedEnd = addMinutesToTime(normalized, 45);
    if (!endTouched || !sanitizeTime(endInput.value)) {
      if (suggestedEnd) {
        endInput.value = suggestedEnd;
      }
    }
  });

  const pauseWrap = document.createElement('label');
  pauseWrap.className = 'inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600';
  const pauseCheckbox = document.createElement('input');
  pauseCheckbox.type = 'checkbox';
  pauseCheckbox.className = 'h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500/40';
  pauseCheckbox.checked = !!current.isPause;
  const pauseText = document.createElement('span');
  pauseText.textContent = 'Als Pause markieren';
  pauseWrap.append(pauseCheckbox, pauseText);
  body.appendChild(pauseWrap);

  const insertRow = document.createElement('div');
  insertRow.className = 'flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600';
  const insertLabel = document.createElement('span');
  insertLabel.textContent = 'Weitere Slots einfügen:';
  const insertActions = document.createElement('div');
  insertActions.className = 'flex items-center gap-2';

  const insertAboveBtn = document.createElement('button');
  insertAboveBtn.type = 'button';
  insertAboveBtn.className = 'rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition';
  insertAboveBtn.textContent = 'Über diesem';
  insertAboveBtn.addEventListener('click', () => {
    const insertedIndex = insertSlotRelative(slotIndex, 'before');
    if (insertedIndex >= 0) {
      closeModal();
      openSlotModal(insertedIndex);
    }
  });

  const insertBelowBtn = document.createElement('button');
  insertBelowBtn.type = 'button';
  insertBelowBtn.className = 'rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition';
  insertBelowBtn.textContent = 'Unter diesem';
  insertBelowBtn.addEventListener('click', () => {
    const insertedIndex = insertSlotRelative(slotIndex, 'after');
    if (insertedIndex >= 0) {
      closeModal();
      openSlotModal(insertedIndex);
    }
  });

  insertActions.append(insertAboveBtn, insertBelowBtn);
  insertRow.append(insertLabel, insertActions);
  body.appendChild(insertRow);

  const statusBox = document.createElement('div');
  statusBox.className = 'hidden rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700';
  body.appendChild(statusBox);

  const footer = document.createElement('div');
  footer.className = 'flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-4 bg-gray-50';
  modal.appendChild(footer);

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100 transition';
  deleteBtn.textContent = 'Slot entfernen';
  deleteBtn.disabled = state.slots.length <= 1;

  const actionWrap = document.createElement('div');
  actionWrap.className = 'flex items-center gap-2';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition';
  cancelBtn.textContent = 'Abbrechen';
  cancelBtn.addEventListener('click', () => closeModal());

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition';
  saveBtn.textContent = 'Speichern';

  actionWrap.append(cancelBtn, saveBtn);
  footer.append(deleteBtn, actionWrap);

  function showError(message) {
    statusBox.textContent = message;
    statusBox.classList.remove('hidden');
  }

  function clearError() {
    statusBox.classList.add('hidden');
    statusBox.textContent = '';
  }

  pauseCheckbox.addEventListener('change', () => {
    if (pauseCheckbox.checked && !labelInput.value.trim()) {
      labelInput.value = 'Pause';
    }
    updateTitle();
  });

  updateTitle();

  saveBtn.addEventListener('click', () => {
    clearError();
    const start = sanitizeTime(startInput.value);
    const end = sanitizeTime(endInput.value);
    if (!start || !end) {
      showError('Bitte gültige Start- und Endzeit eingeben.');
      return;
    }
    const startMinutes = timeToMinutes(start);
    const endMinutes = timeToMinutes(end);
    if (startMinutes == null || endMinutes == null || startMinutes >= endMinutes) {
      showError('Die Endzeit muss nach der Startzeit liegen.');
      return;
    }
    let labelValue = labelInput.value.trim();
    if (!labelValue) {
      labelValue = pauseCheckbox.checked ? 'Pause' : `Slot ${slotIndex + 1}`;
    }
    const updatedSlots = state.slots.map((slot, idx) => {
      if (idx !== slotIndex) return slot;
      return {
        ...slot,
        label: labelValue,
        start,
        end,
        isPause: pauseCheckbox.checked,
      };
    });
    const result = applySlotChanges(updatedSlots);
    if (result === true || result === 'unchanged') {
      closeModal();
    }
  });

  deleteBtn.addEventListener('click', async () => {
    if (state.slots.length <= 1) return;
    const confirmed = await confirmModal({
      title: 'Slot entfernen?',
      message: 'Soll dieser Zeitslot dauerhaft gelöscht werden? Zuweisungen in diesem Slot werden entfernt.',
      confirmText: 'Entfernen',
      cancelText: 'Abbrechen',
    });
    if (!confirmed) return;
    const remaining = state.slots.filter((_, idx) => idx !== slotIndex);
    const result = applySlotChanges(remaining);
    if (result === true || result === 'unchanged') {
      closeModal();
    }
  });

  function closeModal() {
    window.removeEventListener('keydown', onKeydown);
    overlay.remove();
    gridContainer.style.pointerEvents = previousPointerEvents;
    gridContainer.style.filter = previousFilter;
    gridContainer.style.opacity = previousOpacity;
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
    }
  }

  window.addEventListener('keydown', onKeydown);
  overlay.addEventListener('click', event => {
    if (event.target === overlay) {
      closeModal();
    }
  });
  document.body.appendChild(overlay);
}

  function buildCurriculumMap(curriculum) {
    const map = new Map();
    curriculum.forEach(entry => {
      const classId = String(entry.class_id);
      const subjectId = Number(entry.subject_id);
      const hours = Number(entry.wochenstunden) || 0;
      if (!map.has(classId)) map.set(classId, new Map());
      const subjectMap = map.get(classId);
      subjectMap.set(subjectId, (subjectMap.get(subjectId) || 0) + hours);
    });
    return map;
  }

  function cloneFixed(rawFixed = {}) {
    const out = {};
    Object.entries(rawFixed).forEach(([classId, entries]) => {
      out[classId] = Array.isArray(entries)
        ? entries.map(entry => ({
            day: entry.day,
            slot: entry.slot,
            subjectId: entry.subjectId ?? entry.subject_id,
          }))
        : [];
    });
    return out;
  }

  function cloneFlexible(rawFlexible = {}) {
    const out = {};
    Object.entries(rawFlexible).forEach(([classId, groups]) => {
      if (!Array.isArray(groups)) {
        out[classId] = [];
        return;
      }
      out[classId] = groups
        .map(group => ({
          id: group.id ?? group.groupId ?? null,
          subjectId: Number(group.subjectId ?? group.subject_id),
          slots: Array.isArray(group.slots)
            ? group.slots
                .map(slot => {
                  const slotValue = Math.trunc(Number(slot.slot));
                  if (!slot.day || Number.isNaN(slotValue)) {
                    return null;
                  }
                  return {
                    day: slot.day,
                    slot: slotValue,
                  };
                })
                .filter(Boolean)
            : [],
        }))
        .filter(group => group.id && Number.isFinite(group.subjectId) && group.slots.length);
    });
    return out;
  }

  function cloneRoomWindows(rawRooms = {}) {
    const out = {};
    Object.entries(rawRooms).forEach(([roomId, cfg]) => {
      if (!cfg || typeof cfg !== 'object') return;
      const allowed = {};
      const sourceAllowed = cfg.allowed && typeof cfg.allowed === 'object' ? cfg.allowed : {};
      DAYS.forEach(day => {
        const arr = Array.isArray(sourceAllowed[day.key]) ? sourceAllowed[day.key] : [];
        allowed[day.key] = arr.map(value => Boolean(value));
      });
      out[roomId] = { allowed };
    });
    return out;
  }

  function ensureFlexCounter() {
    if (!state.rawData.meta) state.rawData.meta = { ...DEFAULT_META };
    if (typeof state.rawData.meta.flexCounter !== 'number' || Number.isNaN(state.rawData.meta.flexCounter)) {
      state.rawData.meta.flexCounter = 1;
    }
    const flexData = state.rawData.flexible || {};
    let maxId = 0;
    Object.values(flexData).forEach(groups => {
      if (!Array.isArray(groups)) return;
      groups.forEach(group => {
        const groupId = group?.id ?? group?.groupId;
        if (typeof groupId === 'string' && groupId.startsWith('flex-')) {
          const tail = Number(groupId.slice(5));
          if (!Number.isNaN(tail)) {
            maxId = Math.max(maxId, tail);
          }
        }
      });
    });
    if (maxId >= state.rawData.meta.flexCounter) {
      state.rawData.meta.flexCounter = maxId + 1;
    }
  }

  function ensureSlotCounter() {
    if (!state.rawData.meta) state.rawData.meta = { ...DEFAULT_META };
    const slots = Array.isArray(state.rawData.meta.slots) ? state.rawData.meta.slots : state.slots;
    const baseLength = Array.isArray(slots) ? slots.length : DEFAULT_SLOTS.length;
    if (typeof state.rawData.meta.slotCounter !== 'number' || Number.isNaN(state.rawData.meta.slotCounter)) {
      state.rawData.meta.slotCounter = baseLength + 1;
    }
    if (Array.isArray(slots)) {
      slots.forEach(slot => {
        const slotId = typeof slot?.id === 'string' ? slot.id : null;
        if (!slotId || !slotId.startsWith('slot-')) return;
        const numeric = Number(slotId.slice(5));
        if (!Number.isNaN(numeric) && numeric >= state.rawData.meta.slotCounter) {
          state.rawData.meta.slotCounter = numeric + 1;
        }
      });
    }
  }

  function createFlexibleGroupId() {
    ensureFlexCounter();
    const next = Number(state.rawData.meta.flexCounter) || 1;
    state.rawData.meta.flexCounter = next + 1;
    return `flex-${next}`;
  }

  function createSlotId() {
    ensureSlotCounter();
    const next = Number(state.rawData.meta.slotCounter) || (Array.isArray(state.slots) ? state.slots.length + 1 : 1);
    state.rawData.meta.slotCounter = next + 1;
    return `slot-${next}`;
  }

  function getFlexibleGroups(classId) {
    return state.flexible[String(classId)] || [];
  }

  function getFlexibleGroup(classId, groupId) {
    const groups = getFlexibleGroups(classId);
    return groups.find(group => group.id === groupId) || null;
  }

  function recomputeRemaining() {
    const remaining = new Map();
    state.classes.forEach(cls => {
      const classId = String(cls.id);
      const totals = new Map(state.curriculum.get(classId) || []);
      const fixedEntries = state.fixed[classId] || [];
      fixedEntries.forEach(entry => {
        const subjectId = Number(entry.subjectId);
        const current = totals.get(subjectId) || 0;
        totals.set(subjectId, Math.max(0, current - 1));
      });
      const flexibleGroups = state.flexible[classId] || [];
      flexibleGroups.forEach(group => {
        const subjectId = Number(group.subjectId);
        const current = totals.get(subjectId) || 0;
        totals.set(subjectId, Math.max(0, current - 1));
      });
      remaining.set(classId, totals);
    });
    state.remaining = remaining;
  }

  function scheduleSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(persistBasisplan, 800);
  }

  async function persistBasisplan() {
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
    state.saving = true;
    status.set('Speichere Basisplan…');
    try {
      const payloadData = {
        ...(state.rawData || {}),
        meta: { ...(state.rawData?.meta || DEFAULT_META) },
        windows: state.windows,
        fixed: state.fixed,
        flexible: state.flexible,
        rooms: state.roomWindows,
      };
      payloadData.meta.slots = deepClone(state.slots);
      const response = await updateBasisplan({ data: payloadData, name: state.rawData?.name || 'Basisplan' });
      state.rawData = response.data ? response.data : payloadData;
      state.rawData.meta = state.rawData.meta || { ...DEFAULT_META };
      state.rawData.meta.slots = deepClone(state.slots);
      ensureSlotCounter();
      ensureFlexCounter();
      state.rawData.windows = deepClone(state.windows);
      state.rawData.fixed = deepClone(state.fixed);
      state.rawData.flexible = deepClone(state.flexible);
      state.rawData.rooms = deepClone(state.roomWindows);
      status.set('Gespeichert.');
      setTimeout(status.clear, 1500);
    } catch (err) {
      status.set(`Fehler: ${formatError(err)}`, true);
    } finally {
      state.saving = false;
    }
  }

  function renderPalette() {
    paletteContainer.innerHTML = '';

    if (state.viewMode === 'rooms') {
      paletteTitle.textContent = 'Raumverfügbarkeit';
      paletteCountLabel.textContent = state.rooms.length ? `${state.rooms.length} Räume` : 'Keine Räume';
      const info = document.createElement('div');
      info.className = 'rounded-lg border border-dashed border-gray-300 bg-white px-3 py-4 text-sm text-gray-600';
      info.innerHTML = state.rooms.length
        ? 'Wähle im Dropdown oben einen Raum aus und bearbeite das Raster, um erlaubte Slots festzulegen.'
        : 'Es sind noch keine Räume angelegt. Lege Räume unter Datenpflege > Räume an, um ihre Verfügbarkeit zu steuern.';
      paletteContainer.appendChild(info);
      return;
    }

    paletteTitle.textContent = 'Fächer-Palette';
    const searchTerm = (state.paletteSearchTerm || '').trim().toLowerCase();
    const groups = [];

    const collectEntriesForClass = cls => {
      const classId = String(cls.id);
      const remainingSubjects = state.remaining.get(classId) || new Map();
      const items = [];
      remainingSubjects.forEach((hours, subjectId) => {
        if (!hours || hours <= 0) return;
        const subject = state.subjects.get(Number(subjectId));
        const code = (subject?.kuerzel || '').toLowerCase();
        const name = (subject?.name || '').toLowerCase();
        if (searchTerm && !(code.includes(searchTerm) || name.includes(searchTerm))) {
          return;
        }
        items.push({
          classId,
          subjectId: Number(subjectId),
          hours,
          subject,
        });
      });
      if (items.length) {
        items.sort((a, b) => {
          const nameA = a.subject?.name || '';
          const nameB = b.subject?.name || '';
          return nameA.localeCompare(nameB);
        });
        groups.push({ cls, items });
      }
    };

    if (state.selectedClassId === 'all') {
      state.classes.forEach(collectEntriesForClass);
    } else {
      const selectedClass = state.classes.find(cls => String(cls.id) === state.selectedClassId);
      if (selectedClass) {
        collectEntriesForClass(selectedClass);
      }
    }

    const totalSubjects = groups.reduce((acc, group) => acc + group.items.length, 0);
    paletteCountLabel.textContent = `${totalSubjects} Fächer`;

    if (!groups.length) {
      const empty = document.createElement('div');
      empty.className = 'rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-6 text-center text-xs text-gray-500';
      empty.textContent = state.selectedClassId === 'all'
        ? 'Es sind keine offenen Stunden in den Klassen verfügbar.'
        : 'Keine offenen Stunden für diese Klasse.';
      paletteContainer.appendChild(empty);
      updateOpenHoursDisplay();
      return;
    }

    const createTile = (classId, item) => {
      const subject = item.subject;
      const color = normalizeHexColor(subject?.color);
      const bright = isColorBright(color);

      const tile = document.createElement('div');
      tile.className = 'group relative flex items-center justify-between gap-3 rounded-lg border px-3 py-3 shadow-sm transition hover:shadow-md';
      tile.style.borderColor = rgbaString(hexToRgb(color), 0.45);
      tile.style.backgroundColor = mixWithWhite(color, 0.2, 1);
      tile.style.color = bright ? '#1f2937' : '#ffffff';
      tile.draggable = true;

      const infoWrap = document.createElement('div');
      infoWrap.className = 'min-w-0';
      const code = document.createElement('div');
      code.className = 'text-sm font-bold';
      code.textContent = subject?.kuerzel || subject?.name || `Fach ${item.subjectId}`;
      infoWrap.appendChild(code);
      if (subject?.name) {
        const name = document.createElement('div');
        name.className = 'text-xs opacity-90 truncate';
        name.textContent = subject.name;
        infoWrap.appendChild(name);
      }

      const metaWrap = document.createElement('div');
      metaWrap.className = 'flex items-center gap-2';
      metaWrap.style.color = bright ? '#1f2937' : 'rgba(255,255,255,0.9)';
      const hoursBadge = document.createElement('span');
      hoursBadge.className = 'rounded px-2 py-1 text-xs font-bold';
      hoursBadge.style.backgroundColor = bright ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.25)';
      hoursBadge.style.color = bright ? '#1f2937' : '#ffffff';
      hoursBadge.textContent = `${item.hours}h`;
      metaWrap.appendChild(hoursBadge);
      const grip = document.createElement('span');
      grip.className = 'transition';
      grip.style.color = bright ? '#475569' : 'rgba(255,255,255,0.75)';
      grip.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><circle cx="9" cy="5" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>';
      metaWrap.appendChild(grip);

      tile.append(infoWrap, metaWrap);

      tile.addEventListener('dragstart', event => {
        currentDragPayload = {
          kind: 'basisPalette',
          classId,
          subjectId: Number(item.subjectId),
        };
        event.dataTransfer.effectAllowed = 'copy';
        const payload = JSON.stringify(currentDragPayload);
        event.dataTransfer.setData('application/json', payload);
        event.dataTransfer.setData('text/plain', payload);
      });

      tile.addEventListener('dragend', () => {
        currentDragPayload = null;
      });

      return tile;
    };

    groups.forEach(group => {
      const classId = String(group.cls.id);
      const section = document.createElement('div');
      section.className = 'space-y-2';

      if (state.selectedClassId === 'all') {
        const heading = document.createElement('div');
        heading.className = 'flex items-center justify-between text-xs font-semibold text-gray-600 px-1';
        heading.textContent = `${group.cls.name || `Klasse ${group.cls.id}`} • ${group.items.length} Fächer`;
        section.appendChild(heading);
      }

      const list = document.createElement('div');
      list.className = 'space-y-2';
      group.items.forEach(item => {
        list.appendChild(createTile(classId, item));
      });
      section.appendChild(list);

      paletteContainer.appendChild(section);
    });

    updateOpenHoursDisplay();
  }

  function renderGrid() {
    if (state.viewMode === 'rooms') {
      renderRoomGrid();
      return;
    }
    const prevScrollLeft = gridContainer.scrollLeft;
    const prevScrollTop = gridContainer.scrollTop;
    gridContainer.innerHTML = '';

    const classes = state.selectedClassId === 'all'
      ? state.classes.slice()
      : state.classes.filter(cls => String(cls.id) === state.selectedClassId);

    if (!classes.length) {
      const empty = document.createElement('div');
      empty.className = 'alert alert-info';
      empty.textContent = 'Keine Klassen verfügbar.';
      gridContainer.appendChild(empty);
      return;
    }

    const columnCount = DAYS.length * classes.length;
    const grid = document.createElement('div');
    const columnHeaderMap = new Map();
    const dayHeaderMap = new Map();
    const timeHeaderMap = new Map();
    grid.className = 'basis-grid border border-base-300 rounded-lg';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = `110px repeat(${columnCount}, minmax(110px, 1fr))`;

    // Day headers
    grid.appendChild(createCell('', 'bg-base-200 font-semibold text-center border-b border-base-300 basis-grid__sticky-corner basis-grid__sticky-top basis-grid__sticky-col'));
    DAYS.forEach(day => {
      const dayHeader = createCell(day.label, 'bg-base-200 font-semibold text-center border-b border-base-300 basis-grid__sticky-top');
      dayHeader.style.gridColumn = `span ${classes.length}`;
      dayHeaderMap.set(day.key, dayHeader);
      grid.appendChild(dayHeader);
    });

    // Class headers per day
    grid.appendChild(createCell('', 'bg-base-100 border-b border-base-300 basis-grid__sticky-col'));
    DAYS.forEach(day => {
      classes.forEach(cls => {
        const clsHeader = createCell(cls.name || `Klasse ${cls.id}`, 'bg-base-100 text-xs text-center border-b border-base-300 basis-grid__sticky-top');
        columnHeaderMap.set(`${day.key}|${cls.id}`, clsHeader);
        grid.appendChild(clsHeader);
      });
    });

    // Time rows
    const slots = getSlots();
    slots.forEach((slot, slotIndex) => {
      const isPauseSlot = Boolean(slot?.isPause);
      const timeCell = document.createElement('div');
      timeCell.className = 'bg-base-100 border-b border-base-300 basis-grid__sticky-col px-0 py-0';

      const timeButton = document.createElement('button');
      timeButton.type = 'button';
      timeButton.className = 'flex w-full flex-col gap-1 rounded-lg border border-transparent px-3 py-2 text-left text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-blue-500/40';
      if (isPauseSlot) {
        timeButton.classList.add('bg-amber-50', 'text-amber-700', 'hover:bg-amber-100');
      } else {
        timeButton.classList.add('hover:border-blue-300', 'hover:bg-blue-50');
      }
      timeButton.addEventListener('click', () => openSlotModal(slotIndex));

      const labelNode = document.createElement('span');
      labelNode.className = 'font-semibold';
      labelNode.textContent = slot?.label || (isPauseSlot ? 'Pause' : `Slot ${slotIndex + 1}`);
      timeButton.appendChild(labelNode);

      const rangeText = formatSlotRange(slot);
      if (rangeText) {
        const rangeNode = document.createElement('span');
        rangeNode.className = 'text-[11px] text-gray-500';
        rangeNode.textContent = rangeText;
        timeButton.appendChild(rangeNode);
      }

      timeCell.appendChild(timeButton);
      timeHeaderMap.set(slotIndex, timeCell);
      grid.appendChild(timeCell);

      DAYS.forEach(day => {
        classes.forEach(cls => {
          const cell = document.createElement('div');
          cell.className = 'basis-slot-cell min-h-[52px] border-b border-r border-base-200 px-1.5 py-1 flex flex-col items-start gap-1';
          cell.dataset.classId = String(cls.id);
          cell.dataset.day = day.key;
          cell.dataset.slotIndex = String(slotIndex);

          const allowed = isPauseSlot ? false : isSlotAllowed(cls.id, day.key, slotIndex);
          cell.dataset.allowed = allowed ? '1' : '0';
          if (isPauseSlot) {
            cell.className = 'basis-slot-cell h-10 border-b border-r border-base-200 bg-amber-50/60';
            cell.style.minHeight = '2.5rem';
            cell.style.pointerEvents = 'none';
            cell.innerHTML = '';
            grid.appendChild(cell);
            return;
          }

          cell.classList.toggle('bg-white', allowed);
          cell.classList.toggle('bg-gray-100', !allowed);
          cell.classList.toggle('opacity-60', !allowed);
          if (!allowed) {
            cell.classList.add('plan-cell-blocked');
          }

          const pending = state.pendingRange;
          if (pending && pending.classId === String(cls.id)) {
            const group = getFlexibleGroup(pending.classId, pending.groupId);
            const already = group?.slots?.some(currentSlot => currentSlot.day === day.key && currentSlot.slot === slotIndex);
            if (group && !already) {
              cell.classList.add('basis-grid__pending-target');
            }
          }

          cell.addEventListener('click', event => {
            if (event.target.closest('button') || event.target.closest('.basis-slot-entry')) return;
            if (state.pendingRange) {
              const pendingRange = state.pendingRange;
              if (pendingRange.classId === String(cls.id)) {
                const successful = addFlexibleSlot(cls.id, pendingRange.groupId, day.key, slotIndex);
                if (!successful) {
                  // keep pending state for another try
                }
              } else {
                status.set('Option kann nur innerhalb derselben Klasse erweitert werden.', true);
                setTimeout(status.clear, 1500);
              }
              return;
            }
            const currentlyAllowed = cell.getAttribute('data-allowed') === '1';
            setSlotAllowed(cls.id, day.key, slotIndex, !currentlyAllowed);
          });

          setupDropZone(cell, cls.id, day.key, slotIndex, columnHeaderMap, dayHeaderMap, timeHeaderMap);
          renderFixedEntries(cell, cls.id, day.key, slotIndex);
          renderFlexibleEntries(cell, cls.id, day.key, slotIndex);
          const hasEntries = cell.querySelector('.basis-slot-entry');
          if (!allowed && !hasEntries) {
            const blockedLabel = document.createElement('div');
            blockedLabel.className = 'plan-cell-blocked-label plan-cell-blocked-label--basis';
            const blockedIcon = createIcon(ICONS.BAN, { size: 16, className: 'plan-cell-blocked-icon' });
            const blockedText = document.createElement('span');
            blockedText.textContent = 'Gesperrt';
            blockedLabel.append(blockedIcon, blockedText);
            cell.appendChild(blockedLabel);
          }
          grid.appendChild(cell);
        });
      });
    });

    gridContainer.appendChild(grid);
    gridContainer.scrollLeft = prevScrollLeft;
    gridContainer.scrollTop = prevScrollTop;

    updateOpenHoursDisplay();
  }

  function renderRoomGrid() {
    const prevScrollLeft = gridContainer.scrollLeft;
    const prevScrollTop = gridContainer.scrollTop;
    gridContainer.innerHTML = '';
    if (!state.rooms.length) {
      const empty = document.createElement('div');
      empty.className = 'alert alert-info';
      empty.textContent = 'Keine Räume vorhanden. Bitte lege zuerst Räume an.';
      gridContainer.appendChild(empty);
      return;
    }
    if (!state.selectedRoomId || !state.rooms.some(room => String(room.id) === state.selectedRoomId)) {
      state.selectedRoomId = String(state.rooms[0].id);
    }
    const room = state.rooms.find(item => String(item.id) === state.selectedRoomId);
    if (!room) {
      const warning = document.createElement('div');
      warning.className = 'alert alert-warning';
      warning.textContent = 'Ausgewählter Raum wurde nicht gefunden.';
      gridContainer.appendChild(warning);
      return;
    }

    const slots = getSlots();
    const table = document.createElement('table');
    table.className = 'min-w-full border border-base-300 bg-white rounded-lg shadow-sm text-sm';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const timeHead = document.createElement('th');
    timeHead.className = 'bg-base-200 px-4 py-2 text-left uppercase tracking-wide text-xs border border-base-300 w-40';
    timeHead.textContent = room.name || `Raum ${room.id}`;
    headRow.appendChild(timeHead);
    DAYS.forEach(day => {
      const th = document.createElement('th');
      th.className = 'bg-base-200 text-center px-4 py-2 font-semibold border border-base-300';
      th.textContent = day.label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    slots.forEach((slot, slotIndex) => {
      const row = document.createElement('tr');
      const isPauseSlot = Boolean(slot?.isPause);
      const timeCell = document.createElement('th');
      timeCell.className = `px-3 py-3 text-left border border-base-200 ${isPauseSlot ? 'bg-amber-50 text-amber-700' : 'bg-base-100 font-semibold'}`;
      const label = document.createElement('div');
      label.className = 'text-xs uppercase tracking-wide';
      label.textContent = slot?.label || (isPauseSlot ? 'Pause' : `${slotIndex + 1}. Stunde`);
      timeCell.appendChild(label);
      const rangeText = formatSlotRange(slot);
      if (rangeText) {
        const range = document.createElement('div');
        range.className = 'text-[11px] opacity-70 normal-case';
        range.textContent = rangeText;
        timeCell.appendChild(range);
      }
      row.appendChild(timeCell);

      DAYS.forEach(day => {
        const allowed = !isPauseSlot && isRoomSlotAllowed(room.id, day.key, slotIndex);
        const td = document.createElement('td');
        td.className = `border border-base-200 text-center align-middle ${isPauseSlot ? 'bg-amber-50 text-amber-700' : allowed ? 'bg-white' : 'bg-base-200 text-gray-600'}`;
        if (isPauseSlot) {
          td.textContent = slot?.label || 'Pause';
        } else {
          const toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = `basis-window-toggle w-full py-3 text-sm font-semibold rounded ${allowed ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100' : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'}`;
          const toggleIcon = createIcon(allowed ? ICONS.CHECK : ICONS.BAN, { size: 16 });
          const toggleText = document.createElement('span');
          toggleText.textContent = allowed ? 'Erlaubt' : 'Gesperrt';
          toggle.append(toggleIcon, toggleText);
          toggle.addEventListener('click', () => {
            setRoomSlotAllowed(room.id, day.key, slotIndex, !allowed);
            renderRoomGrid();
          });
          td.appendChild(toggle);
        }
        row.appendChild(td);
      });

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    gridContainer.appendChild(table);
    gridContainer.scrollLeft = prevScrollLeft;
    gridContainer.scrollTop = prevScrollTop;
  }

  function renderFixedEntries(cell, classId, dayKey, slotIndex) {
    const classFixed = state.fixed[String(classId)] || [];
    const entries = classFixed.filter(entry => entry.day === dayKey && entry.slot === slotIndex);
    if (!entries.length) {
      return;
    }

    entries.forEach(entry => {
      const subject = state.subjects.get(Number(entry.subjectId));
      const color = normalizeHexColor(subject?.color);
      const badge = document.createElement('span');
      badge.className = 'basis-slot-entry inline-flex items-center gap-1 rounded-md border px-1.5 py-0.75 text-[10px] font-semibold shadow-sm';
      badge.style.borderColor = color;
      badge.style.backgroundColor = mixWithWhite(color, 0.7, 0.6);
      badge.style.color = isColorBright(color) ? '#1f2937' : '#22324d';
      badge.draggable = true;

      badge.addEventListener('dragstart', event => {
        currentDragPayload = {
          kind: 'basisFixed',
          classId: String(classId),
          day: dayKey,
          slot: slotIndex,
          subjectId: Number(entry.subjectId),
        };
        event.dataTransfer.effectAllowed = 'move';
        const payload = JSON.stringify(currentDragPayload);
        event.dataTransfer.setData('application/json', payload);
        event.dataTransfer.setData('text/plain', payload);
      });

      badge.addEventListener('dragend', () => {
        currentDragPayload = null;
      });

      const label = document.createElement('span');
      label.className = 'font-semibold';
      label.textContent = subject?.kuerzel || subject?.name || `Fach ${entry.subjectId}`;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'inline-flex h-4 w-4 items-center justify-center rounded text-[10px] text-red-500 hover:text-red-600';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => {
        removeFixedEntry(classId, dayKey, slotIndex, Number(entry.subjectId));
      });

      const fixedIcon = createIcon(ICONS.LOCK, { size: 12 });
      fixedIcon.style.color = '#b45309';
      badge.append(fixedIcon, label, removeBtn);
      cell.appendChild(badge);
    });
  }

  function renderFlexibleEntries(cell, classId, dayKey, slotIndex) {
    const groups = getFlexibleGroups(classId).filter(group =>
      group.slots.some(slot => slot.day === dayKey && slot.slot === slotIndex)
    );
    if (!groups.length) return;

    groups.forEach(group => {
      const subject = state.subjects.get(Number(group.subjectId));
      const color = normalizeHexColor(subject?.color, '#0f766e');
      const badge = document.createElement('span');
      badge.className = 'basis-slot-entry inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.75 text-[10px] font-semibold shadow-sm';
      badge.style.borderColor = color;
      badge.style.backgroundColor = mixWithWhite(color, 0.78, 0.6);
      badge.style.color = isColorBright(color) ? '#1f2937' : '#1f3c45';
      badge.draggable = false;
      if (state.pendingRange && state.pendingRange.groupId === group.id) {
        badge.classList.add('ring', 'ring-primary', 'ring-offset-1');
      }

      const label = document.createElement('span');
      label.className = 'font-semibold';
      label.textContent = `${subject?.kuerzel || subject?.name || `Fach ${group.subjectId}`}`;

      const btnWrap = document.createElement('div');
      btnWrap.className = 'flex items-center gap-1';

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'inline-flex h-4 w-4 items-center justify-center rounded text-[10px] text-blue-600 hover:text-blue-700';
      addBtn.textContent = '+';
      addBtn.title = 'Zusätzlichen Slot hinzufügen';
      addBtn.addEventListener('click', event => {
        event.stopPropagation();
        if (state.pendingRange && state.pendingRange.groupId === group.id) {
          state.pendingRange = null;
          status.set('Slot-Auswahl abgebrochen.');
          setTimeout(status.clear, 1200);
          renderGrid();
          return;
        }
        state.pendingRange = { classId: String(classId), groupId: group.id };
        status.set('Bitte einen Slot für die Option anklicken.');
        renderGrid();
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'inline-flex h-4 w-4 items-center justify-center rounded text-[10px] text-red-500 hover:text-red-600';
      removeBtn.textContent = '×';
      removeBtn.title = 'Slot aus Option entfernen';
      removeBtn.addEventListener('click', event => {
        event.stopPropagation();
        removeFlexibleSlot(classId, group.id, dayKey, slotIndex);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'inline-flex h-4 min-w-[1rem] items-center justify-center rounded text-[10px] text-gray-500 hover:text-gray-700';
      deleteBtn.textContent = '−';
      deleteBtn.title = 'Option vollständig entfernen';
      deleteBtn.addEventListener('click', event => {
        event.stopPropagation();
        removeFlexibleGroup(classId, group.id);
      });

      btnWrap.append(addBtn, removeBtn, deleteBtn);
      const flexIcon = createIcon(ICONS.UNLOCK, { size: 12 });
      flexIcon.style.color = '#1d4ed8';
      badge.append(flexIcon, label, btnWrap);
      cell.appendChild(badge);
    });
  }

  function setupDropZone(cell, classId, dayKey, slotIndex, columnHeaderMap, dayHeaderMap, timeHeaderMap) {
    const columnKey = `${dayKey}|${classId}`;
    const highlightHeaders = () => {
      const colHeader = columnHeaderMap.get(columnKey);
      if (colHeader) colHeader.classList.add('basis-grid__highlight');
      const timeHeader = timeHeaderMap.get(slotIndex);
      if (timeHeader) timeHeader.classList.add('basis-grid__highlight');
    };
    const unhighlightHeaders = () => {
      const colHeader = columnHeaderMap.get(columnKey);
      if (colHeader) colHeader.classList.remove('basis-grid__highlight');
      const timeHeader = timeHeaderMap.get(slotIndex);
      if (timeHeader) timeHeader.classList.remove('basis-grid__highlight');
    };
    const highlight = () => {
      cell.classList.add('basis-slot-cell--drag');
      highlightHeaders();
    };
    const unhighlight = () => {
      cell.classList.remove('basis-slot-cell--drag');
      unhighlightHeaders();
    };

    cell.addEventListener('dragenter', event => {
      const data = getDragData(event);
      if (!data) return;
      event.preventDefault();
      if (canAcceptDrop(data, classId, dayKey, slotIndex)) highlight();
    });

    cell.addEventListener('dragover', event => {
      const data = getDragData(event);
      if (!data) return;
      const canAccept = canAcceptDrop(data, classId, dayKey, slotIndex);
      event.preventDefault();
      event.dataTransfer.dropEffect = canAccept ? (data.kind === 'basisPalette' ? 'copy' : 'move') : 'none';
      if (canAccept) highlight();
      else unhighlight();
    });

    cell.addEventListener('dragleave', () => {
      unhighlight();
    });

    cell.addEventListener('drop', async event => {
      unhighlight();
      event.preventDefault();
      const data = getDragData(event);
      if (!data) return;
      if (!canAcceptDrop(data, classId, dayKey, slotIndex)) {
        status.set('Slot nicht erlaubt.', true);
        setTimeout(status.clear, 1500);
        return;
      }
      if (data.kind === 'basisPalette') {
        if (state.assignmentMode === 'range') {
          await addFlexibleGroupEntry(classId, dayKey, slotIndex, data.subjectId);
        } else {
          await addFixedEntry(classId, dayKey, slotIndex, data.subjectId);
        }
      } else if (data.kind === 'basisFixed') {
        await moveFixedEntry(data.classId, classId, data.day, dayKey, data.slot, slotIndex, data.subjectId);
      }
    });
  }

  function canAcceptDrop(data, classId, dayKey, slotIndex) {
    if (data.kind === 'basisPalette') {
      if (String(data.classId) !== String(classId)) return false;
      return isSlotAllowed(classId, dayKey, slotIndex);
    }
    if (data.kind === 'basisFixed') {
      return String(data.classId) === String(classId);
    }
    return false;
  }

  async function addFixedEntry(classId, dayKey, slotIndex, subjectId) {
    const key = String(classId);
    state.fixed[key] = state.fixed[key] || [];

    // Single entry per slot – replace existing
    state.fixed[key] = state.fixed[key].filter(entry => !(entry.day === dayKey && entry.slot === slotIndex));
    state.fixed[key].push({ day: dayKey, slot: slotIndex, subjectId: Number(subjectId) });

    state.rawData.fixed = deepClone(state.fixed);
    recomputeRemaining();
    renderPalette();
    renderGrid();
    scheduleSave();
  }

  async function addFlexibleGroupEntry(classId, dayKey, slotIndex, subjectId) {
    const key = String(classId);
    state.flexible[key] = state.flexible[key] || [];
    const groupId = createFlexibleGroupId();
    const group = {
      id: groupId,
      subjectId: Number(subjectId),
      slots: [{ day: dayKey, slot: slotIndex }],
    };
    state.flexible[key].push(group);
    state.rawData.flexible = deepClone(state.flexible);
    state.pendingRange = null;
    recomputeRemaining();
    renderPalette();
    renderGrid();
    scheduleSave();
    status.set('Option angelegt.');
    setTimeout(status.clear, 1200);
  }

  function addFlexibleSlot(classId, groupId, dayKey, slotIndex) {
    const key = String(classId);
    const group = getFlexibleGroup(classId, groupId);
    if (!group) return false;
    if (!isSlotAllowed(classId, dayKey, slotIndex)) {
      status.set('Slot nicht erlaubt.', true);
      setTimeout(status.clear, 1500);
      return false;
    }
    if (group.slots.some(slot => slot.day === dayKey && slot.slot === slotIndex)) {
      status.set('Slot bereits enthalten.', true);
      setTimeout(status.clear, 1200);
      return false;
    }
    group.slots.push({ day: dayKey, slot: slotIndex });
    state.pendingRange = null;
    state.rawData.flexible = deepClone(state.flexible);
    renderGrid();
    renderPalette();
    scheduleSave();
    status.set('Slot ergänzt.');
    setTimeout(status.clear, 1200);
    return true;
  }

  function removeFlexibleSlot(classId, groupId, dayKey, slotIndex) {
    const key = String(classId);
    const groups = getFlexibleGroups(classId);
    const idx = groups.findIndex(group => group.id === groupId);
    if (idx === -1) return;
    const group = groups[idx];
    group.slots = group.slots.filter(slot => !(slot.day === dayKey && slot.slot === slotIndex));
    if (group.slots.length === 0) {
      groups.splice(idx, 1);
      if (state.pendingRange && state.pendingRange.groupId === groupId) {
        state.pendingRange = null;
      }
      recomputeRemaining();
    }
    state.rawData.flexible = deepClone(state.flexible);
    renderPalette();
    renderGrid();
    scheduleSave();
    status.set('Slot entfernt.');
    setTimeout(status.clear, 1200);
  }

  function removeFlexibleGroup(classId, groupId) {
    const key = String(classId);
    const groups = getFlexibleGroups(classId);
    const beforeLength = groups.length;
    state.flexible[key] = groups.filter(group => group.id !== groupId);
    if (state.pendingRange && state.pendingRange.groupId === groupId) {
      state.pendingRange = null;
    }
    if (state.flexible[key].length !== beforeLength) {
      state.rawData.flexible = deepClone(state.flexible);
      recomputeRemaining();
      renderPalette();
      renderGrid();
      scheduleSave();
      status.set('Option entfernt.');
      setTimeout(status.clear, 1200);
    }
  }

  async function moveFixedEntry(fromClassId, toClassId, fromDay, toDay, fromSlot, toSlot, subjectId) {
    const fromKey = String(fromClassId);
    const toKey = String(toClassId);
    if (!state.fixed[fromKey]) return;

    const entryIndex = state.fixed[fromKey].findIndex(
      entry => entry.day === fromDay && entry.slot === fromSlot && Number(entry.subjectId) === Number(subjectId),
    );
    if (entryIndex === -1) return;

    const [entry] = state.fixed[fromKey].splice(entryIndex, 1);
    state.fixed[toKey] = state.fixed[toKey] || [];
    state.fixed[toKey] = state.fixed[toKey].filter(e => !(e.day === toDay && e.slot === toSlot));
    state.fixed[toKey].push({ day: toDay, slot: toSlot, subjectId: entry.subjectId });

    state.rawData.fixed = deepClone(state.fixed);
    recomputeRemaining();
    renderPalette();
    renderGrid();
    scheduleSave();
  }

  async function removeFixedEntry(classId, dayKey, slotIndex, subjectId) {
    const key = String(classId);
    state.fixed[key] = (state.fixed[key] || []).filter(entry => {
      return !(entry.day === dayKey && entry.slot === slotIndex && Number(entry.subjectId) === Number(subjectId));
    });
    state.rawData.fixed = deepClone(state.fixed);
    recomputeRemaining();
    renderPalette();
    renderGrid();
    scheduleSave();
  }

  function countRemainingHours() {
    let total = 0;
    state.remaining.forEach(subjects => {
      subjects.forEach(hours => {
        total += Math.max(0, hours || 0);
      });
    });
    return total;
  }

  function createCell(content, className = '') {
    const div = document.createElement('div');
    if (className) div.className = className;
    if (content) div.textContent = content;
    return div;
  }

  function getDragData(event) {
    try {
      const raw = event.dataTransfer.getData('application/json');
      if (!raw) return currentDragPayload;
      return JSON.parse(raw);
    } catch {
      return currentDragPayload;
    }
  }

  async function loadData() {
    state.loading = true;
    status.set('Lade Daten…');
    try {
      const [classes, subjects, curriculum, rooms, basisplanRes] = await Promise.all([
        fetchClasses(),
        fetchSubjects(),
        fetchCurriculum(),
        fetchRooms(),
        fetchBasisplan(),
      ]);

      state.classes = classes.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      state.subjects = new Map(subjects.map(sub => [Number(sub.id), sub]));
      state.rooms = rooms.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      state.curriculum = buildCurriculumMap(curriculum);

      const data = basisplanRes?.data || {};
      state.rawData = {
        ...data,
        name: basisplanRes?.name || "Basisplan",
        meta: { ...(data.meta || DEFAULT_META) },
        windows: data.windows || {},
        fixed: data.fixed || {},
        flexible: data.flexible || {},
        rooms: data.rooms || {},
        classes: data.classes || {},
      };
      ensureFlexCounter();
      ensureSlotCounter();
      state.slots = normalizeSlots(state.rawData.meta?.slots);
      state.rawData.meta.slots = deepClone(state.slots);
      state.windows = deepClone(state.rawData.windows || {});
      state.fixed = cloneFixed(state.rawData.fixed || {});
      state.flexible = cloneFlexible(state.rawData.flexible || {});
      state.roomWindows = cloneRoomWindows(state.rawData.rooms || {});
      state.rawData.windows = deepClone(state.windows);
      state.rawData.fixed = deepClone(state.fixed);
      state.rawData.flexible = deepClone(state.flexible);
      state.rawData.rooms = deepClone(state.roomWindows);
      state.assignmentMode = 'fixed';
      state.pendingRange = null;
      ensureBaseWindows();
      ensureRoomWindowsBase();
      recomputeRemaining();

      if (!state.selectedClassId || (state.selectedClassId !== 'all' && !state.classes.some(cls => String(cls.id) === state.selectedClassId))) {
        state.selectedClassId = state.classes.length ? String(state.classes[0].id) : 'all';
      }

      classSelect.innerHTML = '<option value=\"all\">Alle Klassen</option>';
      state.classes.forEach(cls => {
        const opt = document.createElement('option');
        opt.value = String(cls.id);
        opt.textContent = cls.name || `Klasse ${cls.id}`;
        classSelect.appendChild(opt);
      });
      classSelect.value = state.selectedClassId;
      if (!state.selectedRoomId || !state.rooms.some(room => String(room.id) === state.selectedRoomId)) {
        state.selectedRoomId = state.rooms.length ? String(state.rooms[0].id) : null;
      }
      roomSelect.innerHTML = '';
      if (!state.rooms.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Keine Räume vorhanden';
        roomSelect.appendChild(opt);
      } else {
        state.rooms.forEach(room => {
          const opt = document.createElement('option');
          opt.value = String(room.id);
          opt.textContent = room.name || `Raum ${room.id}`;
          roomSelect.appendChild(opt);
        });
        roomSelect.value = state.selectedRoomId || String(state.rooms[0].id);
      }
      paletteSearchInput.value = state.paletteSearchTerm;
      updateModeButtons();
      updateViewModeUI();
      updateHeaderContext();
      renderPalette();
      renderGrid();
      updateOpenHoursDisplay();
      status.set('Daten geladen.');
      setTimeout(status.clear, 1200);
    } catch (err) {
      status.set(`Fehler beim Laden: ${formatError(err)}`, true);
    } finally {
      state.loading = false;
    }
  }

  loadData();
  return container;
}

function deepClone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function formatClassLabel(cls) {
  if (!cls) return 'Klasse';
  if (cls.name) return cls.name;
  if (cls.grade && cls.section) return `${cls.grade}${cls.section}`;
  return `Klasse ${cls.id ?? ''}`;
}

function formatSubjectLabel(subject) {
  if (!subject) return 'Fach';
  if (subject.kuerzel && subject.name && subject.kuerzel !== subject.name) {
    return `${subject.kuerzel} (${subject.name})`;
  }
  return subject.kuerzel || subject.name || 'Fach';
}

function normalizeSlots(rawSlots) {
  const source = Array.isArray(rawSlots) && rawSlots.length ? rawSlots : DEFAULT_SLOTS;
  return source.map((entry, index) => {
    const fallback = DEFAULT_SLOTS[index] || DEFAULT_SLOTS[DEFAULT_SLOTS.length - 1] || {};
    const base = typeof entry === 'object' && entry !== null
      ? { ...entry }
      : { label: typeof entry === 'string' ? entry : fallback.label };
    const id = typeof base.id === 'string' && base.id.trim() ? base.id.trim() : `slot-${index + 1}`;
    const label = typeof base.label === 'string' && base.label.trim()
      ? base.label.trim()
      : fallback.label || `Slot ${index + 1}`;
    const parsed = parseTimeRange(base.start, base.end, base.label);
    return {
      id,
      label,
      start: parsed.start || fallback.start || '08:00',
      end: parsed.end || fallback.end || '08:45',
      isPause: Boolean(base.isPause),
    };
  });
}

function parseTimeRange(startValue, endValue, labelValue) {
  const normalized = {
    start: sanitizeTime(startValue),
    end: sanitizeTime(endValue),
  };
  if (!normalized.start || !normalized.end) {
    const label = typeof labelValue === 'string' ? labelValue : '';
    const match = label.match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
    if (match) {
      if (!normalized.start) normalized.start = sanitizeTime(match[1]);
      if (!normalized.end) normalized.end = sanitizeTime(match[2]);
    }
  }
  return normalized;
}

function sanitizeTime(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!/^\d{1,2}:\d{2}$/.test(trimmed)) return null;
  const [hour, minute] = trimmed.split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  const safeHour = Math.max(0, Math.min(23, hour));
  const safeMinute = Math.max(0, Math.min(59, minute));
  return `${String(safeHour).padStart(2, '0')}:${String(safeMinute).padStart(2, '0')}`;
}

function timeToMinutes(value) {
  const safe = sanitizeTime(value);
  if (!safe) return null;
  const [hour, minute] = safe.split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return hour * 60 + minute;
}

function addMinutesToTime(value, minutes) {
  const total = timeToMinutes(value);
  if (total == null) return null;
  const next = Math.max(0, Math.min(23 * 60 + 59, total + minutes));
  const hours = Math.floor(next / 60);
  const mins = next % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function normalizeHexColor(color, fallback = '#2563eb') {
  if (typeof color === 'string') {
    const trimmed = color.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      return trimmed.toLowerCase();
    }
  }
  return fallback;
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex);
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return { r, g, b };
}

function rgbaString({ r, g, b }, alpha = 1) {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mixWithWhite(hex, amount = 0.85, alpha = 1) {
  const { r, g, b } = hexToRgb(hex);
  const mixed = {
    r: Math.round(r + (255 - r) * amount),
    g: Math.round(g + (255 - g) * amount),
    b: Math.round(b + (255 - b) * amount),
  };
  return rgbaString(mixed, alpha);
}

function isColorBright(hex) {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const luminance = 0.2126 * rn + 0.7152 * gn + 0.0722 * bn;
  return luminance > 0.6;
}

function formatSlotRange(slot) {
  if (!slot) return '';
  const start = sanitizeTime(slot.start) || '';
  const end = sanitizeTime(slot.end) || '';
  if (start && end) return `${start} – ${end}`;
  return start || end || '';
}

function createStatusBar() {
  const element = document.createElement('div');
  element.className = 'fixed bottom-6 right-6 z-[100] hidden';
  element.style.pointerEvents = 'none';
  document.body.appendChild(element);

  let hideTimer = null;

  function show(message, error = false) {
    clearTimeout(hideTimer);
    element.innerHTML = `
      <div class="alert ${error ? 'alert-error' : 'alert-success'} shadow-lg text-sm w-max max-w-sm">
        <span>${message || ''}</span>
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

  return {
    element,
    set: show,
    clear,
  };
}

let currentDragPayload = null;
