import { DAYS } from '../constants.js';

export function createPlanEditorSection({
  state,
  statusBar,
  formatError,
  updatePlanSlots,
  onRequestRender,
  toggleHighlightedTeacher,
  isTeacherHighlighted,
  getClassName,
}) {
  const editingSection = document.createElement('div');
  editingSection.className = 'space-y-4 hidden';

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
      slotsMeta: Array.isArray(planEntry.slotsMeta) ? planEntry.slotsMeta : [],
    };
    state.editingParkingSeq = 0;
    state.dragPayload = null;
    onRequestRender();
  }

  function cancelEditingPlan() {
    state.editing = null;
    state.dragPayload = null;
    onRequestRender();
  }

  function resetEditingPlan() {
    if (!state.editing) return;
    state.editing.slotsMap = buildSlotsMapFromArray(state.editing.slotsOriginal);
    state.editing.parking = [];
    state.editing.dirty = false;
    state.dragPayload = null;
    onRequestRender();
  }

  function setEditingDirty(value = true) {
    if (state.editing) {
      state.editing.dirty = value;
    }
  }

  function buildSlotsMapFromArray(slots = []) {
    const map = new Map();
    slots.forEach(slot => {
      const zeroBased = Math.max(0, Number(slot.stunde) - 1);
      const key = getSlotKey(slot.class_id, slot.tag, zeroBased);
      map.set(
        key,
        {
          class_id: slot.class_id,
          tag: slot.tag,
          stunde: zeroBased,
          subject_id: slot.subject_id,
          teacher_id: slot.teacher_id,
          room_id: slot.room_id ?? null,
        },
      );
    });
    return map;
  }

  function cloneSlotsArray(slots = []) {
    return slots.map(entry => ({
      class_id: entry.class_id,
      tag: entry.tag,
      stunde: entry.stunde,
      subject_id: entry.subject_id,
      teacher_id: entry.teacher_id,
      room_id: entry.room_id ?? null,
    }));
  }

  function cloneSlot(slot) {
    return {
      class_id: slot.class_id,
      tag: slot.tag,
      stunde: slot.stunde,
      subject_id: slot.subject_id,
      teacher_id: slot.teacher_id,
      room_id: slot.room_id ?? null,
    };
  }

  function getSlotKey(classId, tag, stunde) {
    return `${classId}-${tag}-${stunde}`;
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
      const active = isTeacherHighlighted(id);
      btn.className = `btn btn-xs ${active ? 'btn-primary' : 'btn-outline'}`;
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
      th.className = 'bg-base-200 text-center text-sm font-semibold uppercase tracking-wide border border-base-300';
      th.textContent = day;
      dayRow.appendChild(th);
    });
    thead.appendChild(dayRow);

    const classRow = document.createElement('tr');
    orderedClassIds.forEach(identifier => {
      const heading = document.createElement('th');
      heading.className = 'bg-base-200 text-center text-xs font-semibold border border-base-300 px-3 py-2';
      heading.textContent = getClassName(state.classes, identifier);
      heading.colSpan = 1;
      DAYS.forEach(() => {});
      classRow.appendChild(heading);
    });
    thead.appendChild(classRow);

    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const slotMetaArray = Array.isArray(state.editing.slotsMeta) ? state.editing.slotsMeta : [];
    for (let stunde = 0; stunde < slotMetaArray.length; stunde += 1) {
      const slotMeta = slotMetaArray[stunde] || { label: `${stunde + 1}. Stunde` };
      const row = document.createElement('tr');
      const labelCell = document.createElement('td');
      labelCell.className = 'bg-base-100 border border-base-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide w-[120px] align-top';
      labelCell.innerHTML = `<div>${slotMeta.label || `${stunde + 1}. Stunde`}</div><div class="text-[11px] opacity-70">${slotMeta.start || ''} - ${slotMeta.end || ''}</div>`;
      row.appendChild(labelCell);

      DAYS.forEach(tag => {
        orderedClassIds.forEach(classId => {
          const cell = document.createElement('td');
          cell.className = 'border border-base-200 align-top w-48 h-20 p-2';
          cell.dataset.classId = classId;
          cell.dataset.tag = tag;
          cell.dataset.stunde = stunde;
          cell.addEventListener('dragover', handleCellDragOver);
          cell.addEventListener('dragleave', handleCellDragLeave);
          cell.addEventListener('drop', handleCellDrop);

          const slotKey = getSlotKey(classId, tag, stunde);
          const slot = state.editing.slotsMap.get(slotKey) || null;
          if (slot) {
            cell.appendChild(renderEditingSlot(slot, slotKey));
          }
          row.appendChild(cell);
        });
      });
      tbody.appendChild(row);
    }

    table.appendChild(tbody);
    body.appendChild(table);
    card.appendChild(body);
    return card;
  }

  function renderEditingSlot(slot, slotKey) {
    const wrapper = document.createElement('div');
    wrapper.className = 'rounded-lg border border-base-300 bg-base-200 px-3 py-2 space-y-1 cursor-grab active:cursor-grabbing';
    wrapper.draggable = true;
    wrapper.addEventListener('dragstart', event => handleSlotDragStart(event, slot));
    wrapper.addEventListener('dragend', handleSlotDragEnd);

    const subject = state.subjects.get(slot.subject_id);
    const teacher = state.teachers.get(slot.teacher_id);
    const room = slot.room_id ? state.rooms.get(slot.room_id) : null;

    const title = document.createElement('div');
    title.className = 'text-sm font-semibold flex items-center justify-between gap-2';
    title.textContent = subject?.name || `Fach #${slot.subject_id}`;
    wrapper.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'text-xs opacity-80';
    meta.textContent = teacher?.kuerzel || teacher?.name || '—';
    wrapper.appendChild(meta);

    const roomLine = document.createElement('div');
    roomLine.className = 'text-[11px] opacity-70';
    roomLine.textContent = room ? `Raum: ${room.name}` : 'Kein Raum';
    wrapper.appendChild(roomLine);

    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-2 text-xs';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-ghost btn-xs text-error';
    removeBtn.textContent = 'Entfernen';
    removeBtn.addEventListener('click', () => {
      state.editing.slotsMap.set(slotKey, null);
      setEditingDirty(true);
      onRequestRender();
    });
    actions.appendChild(removeBtn);
    wrapper.appendChild(actions);

    if (isTeacherHighlighted(slot.teacher_id)) {
      wrapper.classList.add('ring', 'ring-primary', 'ring-offset-2');
    }
    return wrapper;
  }

  function renderEditingPalette() {
    const card = document.createElement('article');
    card.className = 'card bg-base-100 border border-base-200 shadow-sm sticky top-4 h-max';
    const body = document.createElement('div');
    body.className = 'card-body space-y-3';

    const headerRow = document.createElement('div');
    headerRow.className = 'flex items-center justify-between';
    const title = document.createElement('h3');
    title.className = 'text-base font-semibold';
    title.textContent = 'Zwischenablage';
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn btn-ghost btn-xs';
    resetBtn.textContent = 'Leeren';
    resetBtn.disabled = !state.editing.parking.length;
    resetBtn.addEventListener('click', () => {
      state.editing.parking = [];
      setEditingDirty(true);
      onRequestRender();
    });
    headerRow.append(title, resetBtn);
    body.appendChild(headerRow);

    const target = document.createElement('div');
    target.className = 'min-h-[120px] rounded-lg border border-dashed border-base-300 bg-base-100 p-3 space-y-2 text-xs';
    target.addEventListener('dragover', handlePaletteDragOver);
    target.addEventListener('dragleave', handlePaletteDragLeave);
    target.addEventListener('drop', handlePaletteDrop);

    if (!state.editing.parking.length) {
      const placeholder = document.createElement('p');
      placeholder.className = 'opacity-70';
      placeholder.textContent = 'Noch keine Elemente abgelegt. Ziehe Slots hierher um später weiterzuarbeiten.';
      target.appendChild(placeholder);
    } else {
      state.editing.parking.forEach(item => {
        target.appendChild(renderPaletteItem(item));
      });
    }

    body.appendChild(target);
    card.appendChild(body);
    return card;
  }

  function renderPaletteItem(item) {
    const wrapper = document.createElement('div');
    wrapper.className = 'rounded-lg border border-base-300 bg-base-100 p-3 space-y-1 cursor-grab active:cursor-grabbing';
    wrapper.draggable = true;
    wrapper.addEventListener('dragstart', event => handlePaletteDragStart(event, item));
    wrapper.addEventListener('dragend', handleSlotDragEnd);

    const subject = state.subjects.get(item.subjectId);
    const teacher = state.teachers.get(item.teacherId);

    const title = document.createElement('div');
    title.className = 'text-sm font-semibold flex items-center justify-between gap-2';
    const label = document.createElement('span');
    label.textContent = subject?.name || `Fach #${item.subjectId}`;
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
      onRequestRender();
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
      onRequestRender();
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
      onRequestRender();
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

    const payloadSlots = [{
      class_id: slot.class_id,
      tag: slot.tag,
      stunde: slot.stunde,
      subject_id: slot.subject_id,
      teacher_id: slot.teacher_id,
      room_id: slot.room_id ?? null,
    }];
    const originKeys = new Set([key]);

    if (isBandSubject(slot.subject_id)) {
      state.editing.slotsMap.forEach((value, candidateKey) => {
        if (!value) return;
        if (value.subject_id !== slot.subject_id) return;
        if (candidateKey === key) return;
        payloadSlots.push(cloneSlot(value));
        originKeys.add(candidateKey);
      });
    }
    return {
      id: `payload-${Date.now()}`,
      type: isBandSubject(slot.subject_id) ? 'band' : 'slot',
      subjectId: slot.subject_id,
      teacherId: slot.teacher_id,
      canonicalSubjectId: getCanonicalSubjectId(slot.subject_id),
      slots: payloadSlots,
      originKeys,
    };
  }

  function applyDropToCell(targetClassId, targetTag, targetStunde) {
    if (!state.editing || !state.dragPayload) return false;
    const payload = state.dragPayload.data;
    if (!payload) return false;
    const skipKeys = payload.originKeys || new Set();
    const targetKey = getSlotKey(targetClassId, targetTag, targetStunde);
    const occupant = state.editing.slotsMap.get(targetKey);
    if (occupant && !skipKeys.has(targetKey)) {
      statusBar.set('Slot ist belegt. Bitte zuerst freimachen.', true);
      return false;
    }

    if (payload.type === 'band') {
      if (!payload.slots.some(entry => entry.class_id === targetClassId)) {
        statusBar.set('Fach gehört zu einer anderen Klasse.', true);
        return false;
      }
      const canonical = payload.canonicalSubjectId;
      const slotsForClass = payload.slots.filter(entry => entry.class_id === targetClassId);
      if (slotsForClass.length === 0) {
        statusBar.set('Bandfach kann nur auf eine der beteiligten Klassen gezogen werden.', true);
        return false;
      }
      const adjustedSlots = payload.slots.map(entry => ({
        ...entry,
        tag: targetTag,
        stunde: targetStunde,
      }));
      if (!canPlaceSlots(adjustedSlots, skipKeys)) {
        statusBar.set('Lehrkraft ist bereits belegt.', true);
        return false;
      }
      adjustedSlots.forEach(entry => {
        const key = getSlotKey(entry.class_id, entry.tag, entry.stunde);
        state.editing.slotsMap.set(key, cloneSlot(entry));
      });
      payload.originKeys?.forEach(key => {
        state.editing.slotsMap.set(key, null);
      });
      state.editing.parking = state.editing.parking.filter(item => item.id !== payload.id);
      setEditingDirty(true);
      return true;
    }

    const newSlot = payload.slots[0];
    const entry = {
      class_id: targetClassId,
      tag: targetTag,
      stunde: targetStunde,
      subject_id: newSlot.subject_id,
      teacher_id: newSlot.teacher_id,
      room_id: newSlot.room_id ?? null,
    };

    if (!canPlaceSlots([entry], skipKeys)) {
      statusBar.set('Lehrkraft ist bereits belegt.', true);
      return false;
    }
    state.editing.slotsMap.set(targetKey, cloneSlot(entry));
    payload.originKeys?.forEach(key => {
      state.editing.slotsMap.set(key, null);
    });
    state.editing.parking = state.editing.parking.filter(item => item.id !== payload.id);
    setEditingDirty(true);
    return true;
  }

  function moveSlotToPalette() {
    if (!state.editing || !state.dragPayload) return false;
    const payload = state.dragPayload.data;
    if (!payload) return false;

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
    onRequestRender();
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
      const idxA = DAYS.indexOf(a.tag);
      const idxB = DAYS.indexOf(b.tag);
      const dayA = idxA === -1 ? a.tag : idxA;
      const dayB = idxB === -1 ? b.tag : idxB;
      if (dayA < dayB) return -1;
      if (dayA > dayB) return 1;
      if (a.stunde === b.stunde) {
        return a.class_id - b.class_id;
      }
      return a.stunde - b.stunde;
    });
    const payloadSlots = slots.map(slot => ({
      class_id: slot.class_id,
      tag: slot.tag,
      stunde: Number(slot.stunde) + 1,
      subject_id: slot.subject_id,
      teacher_id: slot.teacher_id,
      room_id: slot.room_id ?? null,
    }));
    try {
      statusBar.set('Speichere bearbeiteten Plan…');
      const detail = await updatePlanSlots(state.editing.planId, payloadSlots);
      state.editing.slotsOriginal = cloneSlotsArray(detail.slots || []);
      state.editing.slotsMap = buildSlotsMapFromArray(detail.slots || []);
      state.editing.parking = [];
      state.editing.dirty = false;
      state.editing.slotsMeta = Array.isArray(detail.slots_meta) ? detail.slots_meta : state.editing.slotsMeta;

      state.generatedPlans = state.generatedPlans.map(entry =>
        entry.id === detail.id
          ? {
              ...entry,
              slots: cloneSlotsArray(detail.slots || []),
              slotsMeta: Array.isArray(detail.slots_meta) ? detail.slots_meta : entry.slotsMeta,
              name: detail.name,
              comment: detail.comment,
            }
          : entry
      );
      if (state.lastPlanId === detail.id) {
        state.planName = detail.name || state.planName;
        state.planComment = detail.comment || state.planComment;
      }
      statusBar.set('Plan gespeichert.');
      setTimeout(statusBar.clear, 1500);
      onRequestRender();
    } catch (err) {
      statusBar.set(`Speichern fehlgeschlagen: ${formatError(err)}`, true);
    }
  }

  return {
    element: editingSection,
    startEditingPlan,
    cancelEditingPlan,
    resetEditingPlan,
    renderEditingSection,
    renderTeacherHighlightControls,
  };
}
