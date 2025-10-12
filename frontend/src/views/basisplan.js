import { fetchClasses } from '../api/classes.js';
import { fetchSubjects } from '../api/subjects.js';
import { fetchCurriculum } from '../api/curriculum.js';
import { fetchBasisplan, updateBasisplan } from '../api/basisplan.js';
import { formatError } from '../utils/ui.js';

const DAYS = [
  { key: 'mon', label: 'Montag' },
  { key: 'tue', label: 'Dienstag' },
  { key: 'wed', label: 'Mittwoch' },
  { key: 'thu', label: 'Donnerstag' },
  { key: 'fri', label: 'Freitag' },
];

const SLOTS = [
  { id: 'slot-1', label: '08:00 – 08:45' },
  { id: 'slot-2', label: '08:50 – 09:35' },
  { id: 'slot-3', label: '09:50 – 10:35' },
  { id: 'slot-4', label: '10:40 – 11:25' },
  { id: 'slot-5', label: '11:30 – 12:15' },
  { id: 'slot-6', label: '12:20 – 13:05' },
  { id: 'slot-7', label: '13:30 – 14:15' },
  { id: 'slot-8', label: '14:20 – 15:05' },
];

const DEFAULT_META = { version: 1 };
const DEFAULT_KEY = '__all';

export function createBasisplanView() {
  const container = document.createElement('section');
  container.className = 'space-y-6';

  const header = document.createElement('div');
  header.className = 'space-y-1';
  header.innerHTML = `
    <h1 class="text-2xl font-semibold">Basisplan</h1>
    <p class="text-sm opacity-70">Lege Unterrichtszeiten fest und plane fixe Stunden pro Klasse.</p>
  `;

  const toolbar = document.createElement('div');
  toolbar.className = 'flex flex-wrap items-center gap-3';

  const classFilterWrap = document.createElement('div');
  classFilterWrap.className = 'form-control';
  const classFilterLabel = document.createElement('label');
  classFilterLabel.className = 'label cursor-pointer gap-3';
  const classFilterText = document.createElement('span');
  classFilterText.className = 'label-text text-sm';
  classFilterText.textContent = 'Klasse';
  const classSelect = document.createElement('select');
  classSelect.className = 'select select-bordered select-sm min-w-[180px]';
  classFilterLabel.append(classFilterText, classSelect);
  classFilterWrap.appendChild(classFilterLabel);

  const allowToggleHint = document.createElement('span');
  allowToggleHint.className = 'text-xs opacity-60';
  allowToggleHint.textContent = 'Klick auf ein Feld: erlauben / sperren';

  toolbar.append(classFilterWrap, allowToggleHint);

  const status = createStatusBar();

  const paletteContainer = document.createElement('div');
  paletteContainer.className = 'space-y-3';

  const gridContainer = document.createElement('div');
  gridContainer.className = 'overflow-x-auto';

  container.append(header, toolbar, status.element, paletteContainer, gridContainer);

  const state = {
    loading: false,
    classes: [],
    subjects: new Map(),
    curriculum: new Map(), // classId -> Map(subjectId -> totalHours)
    remaining: new Map(), // classId -> Map(subjectId -> remainingHours)
    windows: {},
    fixed: {},
    rawData: { meta: { ...DEFAULT_META }, windows: {}, fixed: {}, rooms: {}, classes: {} },
    selectedClassId: 'all',
    saveTimer: null,
    saving: false,
  };

  classSelect.addEventListener('change', () => {
    state.selectedClassId = classSelect.value;
    renderGrid();
  });

  function defaultAllowedArray() {
    return Array.from({ length: SLOTS.length }, () => true);
  }

  function ensureWindowsFor(key) {
    const target = state.windows[key] || { allowed: {} };
    if (!target.allowed) target.allowed = {};
    DAYS.forEach(day => {
      const arr = target.allowed[day.key];
      if (!Array.isArray(arr) || arr.length !== SLOTS.length) {
        target.allowed[day.key] = defaultAllowedArray();
      }
    });
    state.windows[key] = target;
  }

  function ensureBaseWindows() {
    if (!state.windows[DEFAULT_KEY]) {
      state.windows[DEFAULT_KEY] = { allowed: {} };
    }
    ensureWindowsFor(DEFAULT_KEY);
    state.classes.forEach(cls => {
      ensureWindowsFor(String(cls.id));
    });
    state.rawData.windows = deepClone(state.windows);
  }

  function isSlotAllowed(classId, dayKey, slotIndex) {
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

  function setSlotAllowed(targetClassId, dayKey, slotIndex, value) {
    const key = state.selectedClassId === 'all' ? DEFAULT_KEY : String(targetClassId);
    ensureWindowsFor(key);
    state.windows[key].allowed[dayKey][slotIndex] = value;
    state.rawData.windows = deepClone(state.windows);
    scheduleSave();
    renderGrid();
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
      };
      const response = await updateBasisplan({ data: payloadData, name: state.rawData?.name || 'Basisplan' });
      state.rawData = response.data ? response.data : payloadData;
      state.rawData.meta = state.rawData.meta || { ...DEFAULT_META };
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

    const palette = document.createElement('div');
    palette.className = 'space-y-3';

    const headerRow = document.createElement('div');
    headerRow.className = 'flex items-center justify-between gap-3';
    const title = document.createElement('h3');
    title.className = 'text-lg font-semibold';
    title.textContent = 'Fächer-Palette';
    const totalBadge = document.createElement('span');
    totalBadge.className = 'badge badge-outline';
    totalBadge.textContent = `${countRemainingHours()} Stunden offen`;
    headerRow.append(title, totalBadge);

    const scroller = document.createElement('div');
    scroller.className = 'overflow-x-auto pb-1';
    const row = document.createElement('div');
    row.className = 'flex gap-4 min-w-fit';
    scroller.appendChild(row);

    state.classes.forEach(cls => {
      const classId = String(cls.id);
      const remainingSubjects = state.remaining.get(classId) || new Map();
      const subjectsWithHours = Array.from(remainingSubjects.entries())
        .filter(([, hours]) => hours > 0)
        .sort((a, b) => {
          const subjA = state.subjects.get(a[0])?.name || '';
          const subjB = state.subjects.get(b[0])?.name || '';
          return subjA.localeCompare(subjB);
        });

      if (!subjectsWithHours.length) return;

      const card = document.createElement('article');
      card.className = 'card bg-base-100 border border-base-200 shadow-sm min-w-[260px]';
      const body = document.createElement('div');
      body.className = 'card-body space-y-4';

      const header = document.createElement('div');
      header.className = 'flex items-center justify-between gap-2';
      const label = document.createElement('h4');
      label.className = 'font-semibold text-sm';
      label.textContent = cls.name || `Klasse ${cls.id}`;
      header.appendChild(label);
      body.appendChild(header);

      const list = document.createElement('div');
      list.className = 'flex flex-wrap gap-2';

      subjectsWithHours.forEach(([subjectId, hours]) => {
        const subject = state.subjects.get(Number(subjectId));
        const pill = document.createElement('span');
        pill.className = 'inline-flex items-center gap-3 rounded-lg border bg-base-100 px-3 py-2 cursor-grab active:cursor-grabbing shadow-sm';
        if (subject?.color) pill.style.borderColor = subject.color;
        pill.draggable = true;

        const labelWrap = document.createElement('div');
        labelWrap.className = 'flex flex-col leading-tight text-left';
        const subjectRow = document.createElement('span');
        subjectRow.className = 'flex items-center gap-2';
        const subjectLabel = document.createElement('span');
        subjectLabel.className = 'font-semibold text-xs';
        subjectLabel.textContent = subject?.name || subject?.kuerzel || `Fach ${subjectId}`;
        const countBadge = document.createElement('span');
        countBadge.className = 'badge badge-sm badge-primary';
        countBadge.textContent = String(hours);
        subjectRow.append(subjectLabel, countBadge);
        labelWrap.appendChild(subjectRow);

        pill.append(labelWrap);

        pill.addEventListener('dragstart', event => {
          currentDragPayload = {
            kind: 'basisPalette',
            classId,
            subjectId: Number(subjectId),
          };
          event.dataTransfer.effectAllowed = 'copy';
          const payload = JSON.stringify(currentDragPayload);
          event.dataTransfer.setData('application/json', payload);
          event.dataTransfer.setData('text/plain', payload);
        });

        pill.addEventListener('dragend', () => {
          currentDragPayload = null;
        });

        list.appendChild(pill);
      });

      body.appendChild(list);
      card.appendChild(body);
      row.appendChild(card);
    });

    if (!row.children.length) {
      const empty = document.createElement('div');
      empty.className = 'alert alert-info';
      empty.textContent = 'Alle Stunden sind bereits verplant oder nicht verfügbar.';
      palette.append(headerRow, empty);
    } else {
      palette.append(headerRow, scroller);
    }

    paletteContainer.appendChild(palette);
  }

  function renderGrid() {
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
    grid.className = 'basis-grid border border-base-300 rounded-lg';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = `140px repeat(${columnCount}, minmax(140px, 1fr))`;

    // Day headers
    grid.appendChild(createCell('', 'bg-base-200 font-semibold text-center border-b border-base-300'));
    DAYS.forEach(day => {
      const dayHeader = createCell(day.label, 'bg-base-200 font-semibold text-center border-b border-base-300');
      dayHeader.style.gridColumn = `span ${classes.length}`;
      grid.appendChild(dayHeader);
    });

    // Class headers per day
    grid.appendChild(createCell('', 'bg-base-100 border-b border-base-300'));
    DAYS.forEach(() => {
      classes.forEach(cls => {
        const clsHeader = createCell(cls.name || `Klasse ${cls.id}`, 'bg-base-100 text-xs text-center border-b border-base-300');
        grid.appendChild(clsHeader);
      });
    });

    // Time rows
    SLOTS.forEach((slot, slotIndex) => {
      const timeCell = createCell(slot.label, 'bg-base-100 border-b border-base-300 text-xs font-medium px-3 py-2');
      grid.appendChild(timeCell);

      DAYS.forEach(day => {
        classes.forEach(cls => {
          const cell = document.createElement('div');
          cell.className = 'min-h-[80px] border-b border-r border-base-200 px-2 py-1 flex flex-col gap-2 transition-colors';
          cell.dataset.classId = String(cls.id);
          cell.dataset.day = day.key;
          cell.dataset.slotIndex = String(slotIndex);
          const allowed = isSlotAllowed(cls.id, day.key, slotIndex);
          cell.classList.toggle('bg-success/10', allowed);
          cell.classList.toggle('bg-base-200', !allowed);

          cell.addEventListener('click', event => {
            if (event.target !== cell) return;
            setSlotAllowed(cls.id, day.key, slotIndex, !allowed);
          });

          setupDropZone(cell, cls.id, day.key, slotIndex);
          renderFixedEntries(cell, cls.id, day.key, slotIndex);
          grid.appendChild(cell);
        });
      });
    });

    gridContainer.appendChild(grid);
  }

  function renderFixedEntries(cell, classId, dayKey, slotIndex) {
    const classFixed = state.fixed[String(classId)] || [];
    const entries = classFixed.filter(entry => entry.day === dayKey && entry.slot === slotIndex);
    if (!entries.length) {
      const hint = document.createElement('span');
      hint.className = 'text-[11px] opacity-50';
      hint.textContent = 'Leer';
      cell.appendChild(hint);
      return;
    }

    entries.forEach(entry => {
      const subject = state.subjects.get(Number(entry.subjectId));
      const badge = document.createElement('span');
      badge.className = 'inline-flex items-center gap-2 rounded-lg border bg-base-100 px-2 py-1 text-xs shadow-sm';
      if (subject?.color) badge.style.borderColor = subject.color;
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
      label.textContent = subject?.kuerzel || subject?.name || `Fach ${entry.subjectId}`;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn-ghost btn-xs text-error px-2';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => {
        removeFixedEntry(classId, dayKey, slotIndex, Number(entry.subjectId));
      });

      badge.append(label, removeBtn);
      cell.appendChild(badge);
    });
  }

  function setupDropZone(cell, classId, dayKey, slotIndex) {
    const highlight = () => cell.classList.add('ring', 'ring-primary');
    const unhighlight = () => cell.classList.remove('ring', 'ring-primary');

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
        await addFixedEntry(classId, dayKey, slotIndex, data.subjectId);
      } else if (data.kind === 'basisFixed') {
        await moveFixedEntry(data.classId, classId, data.day, dayKey, data.slot, slotIndex, data.subjectId);
      }
    });
  }

  function canAcceptDrop(data, classId, dayKey, slotIndex) {
    if (data.kind === 'basisPalette') {
      return String(data.classId) === String(classId) && isSlotAllowed(classId, dayKey, slotIndex);
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
      const [classes, subjects, curriculum, basisplanRes] = await Promise.all([
        fetchClasses(),
        fetchSubjects(),
        fetchCurriculum(),
        fetchBasisplan(),
      ]);

      state.classes = classes.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      state.subjects = new Map(subjects.map(sub => [Number(sub.id), sub]));
      state.curriculum = buildCurriculumMap(curriculum);

      const data = basisplanRes?.data || {};
      state.rawData = {
        ...data,
        name: basisplanRes?.name || "Basisplan",
        meta: { ...(data.meta || DEFAULT_META) },
        windows: data.windows || {},
        fixed: data.fixed || {},
        rooms: data.rooms || {},
        classes: data.classes || {},
      };
      state.windows = deepClone(state.rawData.windows || {});
      state.fixed = cloneFixed(state.rawData.fixed || {});
      state.rawData.windows = deepClone(state.windows);
      state.rawData.fixed = deepClone(state.fixed);
      ensureBaseWindows();
      recomputeRemaining();

      classSelect.innerHTML = '<option value=\"all\">Alle Klassen</option>';
      classSelect.value = state.selectedClassId;
      state.classes.forEach(cls => {
        const opt = document.createElement('option');
        opt.value = String(cls.id);
        opt.textContent = cls.name || `Klasse ${cls.id}`;
        classSelect.appendChild(opt);
      });

      renderPalette();
      renderGrid();
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

let currentDragPayload = null;
