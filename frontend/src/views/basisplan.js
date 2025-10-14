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

const DEFAULT_META = { version: 1, flexCounter: 1 };
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
    z-index: 30;
    background: var(--b1);
  }
  .basis-grid__sticky-corner {
    position: sticky;
    left: 0;
    top: 0;
    z-index: 50;
    background: var(--b1);
  }
  .basis-grid__sticky-top {
    position: sticky;
    top: 0;
    z-index: 40;
    background: var(--b1);
  }
  .basis-grid__sticky-top.basis-grid__sticky-col {
    z-index: 60;
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

  container.append(header, toolbar, paletteContainer, gridContainer);

  const state = {
    loading: false,
    classes: [],
    subjects: new Map(),
    curriculum: new Map(), // classId -> Map(subjectId -> totalHours)
    remaining: new Map(), // classId -> Map(subjectId -> remainingHours)
    windows: {},
    fixed: {},
    flexible: {},
    rawData: { meta: { ...DEFAULT_META }, windows: {}, fixed: {}, flexible: {}, rooms: {}, classes: {} },
    selectedClassId: 'all',
    saveTimer: null,
    saving: false,
    assignmentMode: 'fixed',
    pendingRange: null,
  };

  classSelect.addEventListener('change', () => {
    state.selectedClassId = classSelect.value;
    state.pendingRange = null;
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
      const key = String(cls.id);
      if (state.windows[key]) ensureWindowsFor(key);
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

  function createFlexibleGroupId() {
    ensureFlexCounter();
    const next = Number(state.rawData.meta.flexCounter) || 1;
    state.rawData.meta.flexCounter = next + 1;
    return `flex-${next}`;
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
      };
      const response = await updateBasisplan({ data: payloadData, name: state.rawData?.name || 'Basisplan' });
      state.rawData = response.data ? response.data : payloadData;
      state.rawData.meta = state.rawData.meta || { ...DEFAULT_META };
      ensureFlexCounter();
      state.rawData.windows = deepClone(state.windows);
      state.rawData.fixed = deepClone(state.fixed);
      state.rawData.flexible = deepClone(state.flexible);
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
    headerRow.className = 'flex flex-wrap items-center justify-between gap-3';
    const title = document.createElement('h3');
    title.className = 'text-lg font-semibold';
    title.textContent = 'Fächer-Palette';
    const totalBadge = document.createElement('span');
    totalBadge.className = 'badge badge-outline';
    totalBadge.textContent = `${countRemainingHours()} Stunden offen`;
    const headerLeft = document.createElement('div');
    headerLeft.className = 'flex items-center gap-2';
    headerLeft.appendChild(title);

    const headerRight = document.createElement('div');
    headerRight.className = 'flex items-center gap-2 flex-wrap';
    headerRight.append(totalBadge, createAssignmentModeToggle());

    headerRow.append(headerLeft, headerRight);

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

    if (state.assignmentMode === 'range') {
      const helper = document.createElement('p');
      helper.className = 'text-xs opacity-70';
      helper.textContent = 'Option-Modus aktiv: Fächer via Drag & Drop ablegen und bei Bedarf über das Plus-Symbol weitere Slots wählen.';
      palette.appendChild(helper);
    }

    paletteContainer.appendChild(palette);
  }

  function renderGrid() {
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
    grid.style.gridTemplateColumns = `140px repeat(${columnCount}, minmax(140px, 1fr))`;

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
    SLOTS.forEach((slot, slotIndex) => {
      const timeCell = createCell(slot.label, 'bg-base-100 border-b border-base-300 text-xs font-medium px-3 py-2 basis-grid__sticky-col');
      timeHeaderMap.set(slotIndex, timeCell);
      grid.appendChild(timeCell);

      DAYS.forEach(day => {
        classes.forEach(cls => {
          const cell = document.createElement('div');
          cell.className = 'basis-slot-cell min-h-[80px] border-b border-r border-base-200 px-2 py-1 flex flex-col gap-2';
          cell.dataset.classId = String(cls.id);
          cell.dataset.day = day.key;
          cell.dataset.slotIndex = String(slotIndex);
          const allowed = isSlotAllowed(cls.id, day.key, slotIndex);
          cell.dataset.allowed = allowed ? '1' : '0';
          cell.classList.toggle('bg-success/10', allowed);
          cell.classList.toggle('bg-base-200', !allowed);
          cell.classList.toggle('opacity-50', !allowed);

          const pending = state.pendingRange;
          if (pending && pending.classId === String(cls.id)) {
            const group = getFlexibleGroup(pending.classId, pending.groupId);
            const already = group?.slots?.some(slot => slot.day === day.key && slot.slot === slotIndex);
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
          grid.appendChild(cell);
        });
      });
    });

    gridContainer.appendChild(grid);
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
      const badge = document.createElement('span');
      badge.className = 'basis-slot-entry inline-flex items-center gap-2 rounded-lg border bg-base-100 px-2 py-1 text-xs shadow-sm';
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

  function renderFlexibleEntries(cell, classId, dayKey, slotIndex) {
    const groups = getFlexibleGroups(classId).filter(group =>
      group.slots.some(slot => slot.day === dayKey && slot.slot === slotIndex)
    );
    if (!groups.length) return;

    groups.forEach(group => {
      const subject = state.subjects.get(Number(group.subjectId));
      const badge = document.createElement('span');
      badge.className = 'basis-slot-entry inline-flex items-center gap-1 rounded-lg border border-dashed bg-base-100 px-2 py-1 text-xs shadow-sm';
      badge.draggable = false;
      if (subject?.color) badge.style.borderColor = subject.color;
      if (state.pendingRange && state.pendingRange.groupId === group.id) {
        badge.classList.add('ring', 'ring-primary', 'ring-offset-1');
      }

      const label = document.createElement('span');
      label.textContent = `${subject?.kuerzel || subject?.name || `Fach ${group.subjectId}`} (Option)`;

      const btnWrap = document.createElement('div');
      btnWrap.className = 'flex items-center gap-1';

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'btn btn-ghost btn-xs px-2';
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
      removeBtn.className = 'btn btn-ghost btn-xs text-error px-2';
      removeBtn.textContent = '×';
      removeBtn.title = 'Slot aus Option entfernen';
      removeBtn.addEventListener('click', event => {
        event.stopPropagation();
        removeFlexibleSlot(classId, group.id, dayKey, slotIndex);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-ghost btn-xs px-2';
      deleteBtn.textContent = 'Del';
      deleteBtn.title = 'Option vollständig entfernen';
      deleteBtn.addEventListener('click', event => {
        event.stopPropagation();
        removeFlexibleGroup(classId, group.id);
      });

      btnWrap.append(addBtn, removeBtn, deleteBtn);
      badge.append(label, btnWrap);
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

  function createAssignmentModeToggle() {
    const wrap = document.createElement('div');
    wrap.className = 'join';

    const fixedBtn = document.createElement('button');
    fixedBtn.type = 'button';
    fixedBtn.className = `btn btn-xs join-item ${state.assignmentMode === 'fixed' ? 'btn-primary' : 'btn-outline'}`;
    fixedBtn.textContent = 'Fix';
    fixedBtn.title = 'Fächer fest auf einen Slot legen';
    fixedBtn.addEventListener('click', () => {
      if (state.assignmentMode === 'fixed') return;
      state.assignmentMode = 'fixed';
      state.pendingRange = null;
      renderPalette();
      renderGrid();
      status.set('Modus: Fixierte Stunden');
      setTimeout(status.clear, 1200);
    });

    const rangeBtn = document.createElement('button');
    rangeBtn.type = 'button';
    rangeBtn.className = `btn btn-xs join-item ${state.assignmentMode === 'range' ? 'btn-primary' : 'btn-outline'}`;
    rangeBtn.textContent = 'Option';
    rangeBtn.title = 'Optionale Slots für einen Bereich hinterlegen';
    rangeBtn.addEventListener('click', () => {
      if (state.assignmentMode === 'range') return;
      state.assignmentMode = 'range';
      state.pendingRange = null;
      renderPalette();
      renderGrid();
      status.set('Modus: Optionen – Slots per Drag & Drop wählen.');
      setTimeout(status.clear, 1800);
    });

    wrap.append(fixedBtn, rangeBtn);
    return wrap;
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
        flexible: data.flexible || {},
        rooms: data.rooms || {},
        classes: data.classes || {},
      };
      ensureFlexCounter();
      state.windows = deepClone(state.rawData.windows || {});
      state.fixed = cloneFixed(state.rawData.fixed || {});
      state.flexible = cloneFlexible(state.rawData.flexible || {});
      state.rawData.windows = deepClone(state.windows);
      state.rawData.fixed = deepClone(state.fixed);
      state.rawData.flexible = deepClone(state.flexible);
      state.assignmentMode = 'fixed';
      state.pendingRange = null;
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
