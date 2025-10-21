import { fetchTeachers, updateTeacher, createTeacher, deleteTeacher } from '../api/teachers.js';
import { fetchClasses, createClass, updateClass, deleteClass } from '../api/classes.js';
import { fetchRooms, createRoom, updateRoom, deleteRoom } from '../api/rooms.js';
import { fetchSubjects, createSubject, updateSubject, deleteSubject } from '../api/subjects.js';
import { fetchCurriculum, createCurriculum, updateCurriculum, deleteCurriculum } from '../api/curriculum.js';
import { confirmModal, formatError } from '../utils/ui.js';

const SUBJECT_DOPPEL_OPTIONS = [
  { value: '', label: 'Keine Vorgabe' },
  { value: 'muss', label: 'Doppelstunde muss' },
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
  { value: 'kann', label: 'Doppelstunde kann' },
  { value: 'nein', label: 'Keine Doppelstunde' },
];

const CURRICULUM_NACHMITTAG_OPTIONS = [
  { value: '', label: 'Vererbt (Fach-Standard)' },
  { value: 'muss', label: 'Nachmittag muss' },
  { value: 'kann', label: 'Nachmittag kann' },
  { value: 'nein', label: 'Kein Nachmittag' },
];

export function createDataMaintenanceView() {
  const container = document.createElement('section');
  container.className = 'space-y-6';
  container.innerHTML = `
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold">Datenpflege</h1>
      <p class="text-sm opacity-70">Verwalte Lehrkräfte, Klassen, Fächer und Räume.</p>
    </div>
  `;

  const tabs = document.createElement('div');
  tabs.className = 'tabs tabs-boxed w-fit';
  const entries = [
    { id: 'teachers', label: 'Lehrer' },
    { id: 'classes', label: 'Klassen' },
    { id: 'subjects', label: 'Fächer' },
    { id: 'rooms', label: 'Räume' },
    { id: 'curriculum', label: 'Stundentafel' },
  ];

  let activeSection = null;
  const sectionWrap = document.createElement('div');
  sectionWrap.id = 'maintenance-section';
  sectionWrap.className = 'space-y-4';

  entries.forEach(entry => {
    const tab = document.createElement('a');
    tab.className = 'tab';
    tab.textContent = entry.label;
    tab.dataset.entry = entry.id;
    tab.addEventListener('click', () => switchSection(entry.id));
    tabs.appendChild(tab);
  });

  container.append(tabs, sectionWrap);

  function switchSection(id) {
    tabs.querySelectorAll('.tab').forEach(tab => {
      tab.classList.toggle('tab-active', tab.dataset.entry === id);
    });
    try {
      localStorage.setItem('maintenance-active-tab', id);
    } catch {
      // ignore storage issues
    }
    if (activeSection?.destroy) activeSection.destroy();
    sectionWrap.innerHTML = '';

    if (id === 'teachers') activeSection = createTeachersSection();
    if (id === 'classes') activeSection = createClassesSection();
    if (id === 'subjects') activeSection = createSubjectsSection();
    if (id === 'rooms') activeSection = createRoomsSection();
    if (id === 'curriculum') activeSection = createCurriculumSection();

    if (activeSection?.element) sectionWrap.appendChild(activeSection.element);
  }

  function preferredTab() {
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

// --- Lehrer ---
function createTeachersSection() {
  const wrap = document.createElement('div');
  wrap.className = 'space-y-3';

  const status = createStatusBar();

  const table = createTable([
    'Vorname', 'Nachname', 'Kürzel*', 'Deputat Soll*', 'Deputat Ist', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Aktion'
  ]);
  wrap.appendChild(table.wrapper);

  const state = { teachers: [] };

  const setStatus = status.set;
  const clearStatus = status.clear;

  async function loadTeachers() {
    setStatus('Lade Lehrkräfte…');
    try {
      const data = await fetchTeachers();
      state.teachers = data;
      renderRows();
      setStatus(`${data.length} Lehrkräfte geladen.`);
      setTimeout(clearStatus, 2000);
    } catch (err) {
      setStatus(`Fehler beim Laden: ${formatError(err)}`, true);
    }
  }

  function renderRows() {
    table.tbody.innerHTML = '';
    state.teachers.forEach(teacher => {
      const tr = document.createElement('tr');
      tr.append(
        teacherInputCell(teacher, 'first_name', setStatus, clearStatus),
        teacherInputCell(teacher, 'last_name', setStatus, clearStatus),
        teacherInputCell(teacher, 'kuerzel', setStatus, clearStatus),
        teacherInputCell(teacher, 'deputat_soll', setStatus, clearStatus, 'number'),
        teacherInputCell(teacher, 'deputat', setStatus, clearStatus, 'number'),
        teacherCheckboxCell(teacher, 'work_mo', setStatus, clearStatus),
        teacherCheckboxCell(teacher, 'work_di', setStatus, clearStatus),
        teacherCheckboxCell(teacher, 'work_mi', setStatus, clearStatus),
        teacherCheckboxCell(teacher, 'work_do', setStatus, clearStatus),
        teacherCheckboxCell(teacher, 'work_fr', setStatus, clearStatus),
        teacherActionCell(teacher, loadTeachers, setStatus, clearStatus)
      );
      table.tbody.appendChild(tr);
    });
    table.tbody.appendChild(newTeacherRow(loadTeachers, setStatus, clearStatus));
  }

  loadTeachers();
  return {
    element: wrap,
    destroy() {
      status.destroy();
    },
  };
}

function teacherInputCell(teacher, field, setStatus, clearStatus, type = 'text') {
  const td = document.createElement('td');
  const input = document.createElement('input');
  input.type = type;
  input.className = 'input input-bordered input-sm w-full';
  if (type === 'number') input.min = '0';
  input.value = teacher[field] ?? '';
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
    } catch (err) {
      setStatus(`Fehler: ${formatError(err)}`, true);
    }
  });
  td.appendChild(input);
  return td;
}

function teacherCheckboxCell(teacher, field, setStatus, clearStatus) {
  const td = document.createElement('td');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'checkbox checkbox-sm';
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
    } catch (err) {
      setStatus(`Fehler: ${formatError(err)}`, true);
      checkbox.checked = !!teacher[field];
    }
  });
  const label = document.createElement('label');
  label.className = 'label justify-center cursor-pointer';
  label.appendChild(checkbox);
  td.appendChild(label);
  return td;
}

function teacherActionCell(teacher, reload, setStatus, clearStatus) {
  const td = document.createElement('td');
  td.className = 'text-right';
  const btn = document.createElement('button');
  btn.className = 'btn btn-ghost btn-sm text-error';
  btn.textContent = 'Löschen';
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

function newTeacherRow(onRefresh, setStatus, clearStatus) {
  const tr = document.createElement('tr');
  tr.className = 'bg-base-200/60';

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
  };

  const fields = ['first_name', 'last_name', 'kuerzel', 'deputat_soll', 'deputat'];
  const inputRefs = {};
  fields.forEach(field => {
    const td = document.createElement('td');
    const input = document.createElement('input');
    input.type = field.includes('deputat') ? 'number' : 'text';
    input.min = '0';
    input.className = 'input input-bordered input-sm w-full';
    input.placeholder = field === 'kuerzel' ? 'Kürzel*' : '';
    inputRefs[field] = input;
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
      updateButtonState();
    });
    td.appendChild(input);
    tr.appendChild(td);
  });

  ['work_mo', 'work_di', 'work_mi', 'work_do', 'work_fr'].forEach(field => {
    const td = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checkbox checkbox-sm';
    checkbox.checked = true;
    checkbox.addEventListener('change', () => {
      draft[field] = checkbox.checked;
    });
    const label = document.createElement('label');
    label.className = 'label justify-center cursor-pointer';
    label.appendChild(checkbox);
    td.appendChild(label);
    tr.appendChild(td);
  });

  const actionCell = document.createElement('td');
  actionCell.className = 'text-right';
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary btn-sm';
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

  return tr;
}

// --- Klassen ---
function createClassesSection() {
  const wrap = document.createElement('div');
  wrap.className = 'space-y-3';

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

      const nameCell = document.createElement('td');
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'input input-bordered input-sm w-full';
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
      const select = document.createElement('select');
      select.className = 'select select-bordered select-sm w-full';
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
  td.className = 'text-right';
  const btn = document.createElement('button');
  btn.className = 'btn btn-ghost btn-sm text-error';
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
  tr.className = 'bg-base-200/60';

  const draft = { name: '', homeroom_teacher_id: null };

  const nameCell = document.createElement('td');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'input input-bordered input-sm w-full';
  nameInput.placeholder = 'Klassenname*';
  nameInput.addEventListener('input', () => {
    draft.name = nameInput.value.trim();
    updateButtonState();
  });
  nameCell.appendChild(nameInput);
  tr.appendChild(nameCell);

  const teacherCell = document.createElement('td');
  const select = document.createElement('select');
  select.className = 'select select-bordered select-sm w-full';
  select.innerHTML = teacherOptions(null);
  select.addEventListener('change', () => {
    draft.homeroom_teacher_id = select.value ? Number(select.value) : null;
  });
  teacherCell.appendChild(select);
  tr.appendChild(teacherCell);

  const actionCell = document.createElement('td');
  actionCell.className = 'text-right';
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary btn-sm';
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
function createSubjectsSection() {
  const wrap = document.createElement('div');
  wrap.className = 'space-y-3';

  const status = createStatusBar();

  const table = createTable([
    'Name*',
    'Kürzel',
    'Farbe',
    'Doppelstunde (Std.)',
    'Nachmittag (Std.)',
    'Pflichtraum',
    'Bandfach',
    'AG/Förder',
    'Alias-Fach',
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
      tr.append(
        subjectInputCell(subject, 'name', setStatus, clearStatus, { required: true }),
        subjectInputCell(subject, 'kuerzel', setStatus, clearStatus),
        subjectInputCell(subject, 'color', setStatus, clearStatus),
        subjectEnumCell(subject, 'default_doppelstunde', SUBJECT_DOPPEL_OPTIONS, setStatus, clearStatus),
        subjectEnumCell(subject, 'default_nachmittag', SUBJECT_NACHMITTAG_OPTIONS, setStatus, clearStatus),
        subjectRoomCell(subject, state.rooms, setStatus, clearStatus),
        subjectBandCheckboxCell(subject, setStatus, clearStatus),
        subjectAgCheckboxCell(subject, setStatus, clearStatus),
        subjectAliasCell(subject, state.subjects, setStatus, clearStatus),
        subjectActionCell(subject, setStatus, clearStatus, loadData),
      );
      table.tbody.appendChild(tr);
    });
    table.tbody.appendChild(newSubjectRow(loadData, setStatus, clearStatus, state.rooms));
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
    overlay.className = 'fixed inset-0 z-[120] flex items-center justify-center bg-base-300/70 backdrop-blur-sm p-4';

    const modal = document.createElement('div');
    modal.className = 'bg-base-100 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col';

    const header = document.createElement('div');
    header.className = 'flex items-start justify-between gap-4 border-b border-base-200 px-6 py-4';

    const titleWrap = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'text-xl font-semibold';
    title.textContent = `Stundentafel · ${subject.name || subject.kuerzel || 'Fach'}`;
    const subtitle = document.createElement('p');
    subtitle.className = 'text-sm opacity-70';
    const defaultDoppel = subject.default_doppelstunde || '';
    const defaultNachmittag = subject.default_nachmittag || '';
    subtitle.textContent = [
      defaultDoppel ? `Doppelstunde: ${labelForSubjectDefault(defaultDoppel)}` : 'Doppelstunde: –',
      defaultNachmittag ? `Nachmittag: ${labelForNachmittagDefault(defaultNachmittag)}` : 'Nachmittag: –',
    ].join(' · ');
    titleWrap.append(title, subtitle);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn-sm btn-ghost';
    closeBtn.textContent = '✕';

    header.append(titleWrap, closeBtn);

    const content = document.createElement('div');
    content.className = 'overflow-auto px-6 py-4 flex-1';

    const hint = document.createElement('p');
    hint.className = 'text-xs opacity-70 mb-3';
    hint.textContent = 'Änderungen werden beim Verlassen des Feldes automatisch gespeichert. Leere Stunden entfernen den Eintrag und nutzen die Fach-Standards.';

    const table = document.createElement('table');
    table.className = 'table table-zebra w-full text-sm';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['Klasse', 'Wochenstunden', 'Doppelstunde', 'Nachmittag', 'Teilnahme'].forEach(label => {
      const th = document.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);

    const tbody = document.createElement('tbody');

    const statusLine = document.createElement('div');
    statusLine.className = 'text-xs min-h-[1.25rem] px-6 py-2 border-t border-base-200';

    let statusTimer = null;
    function setModalStatus(message, error = false) {
      clearTimeout(statusTimer);
      statusLine.textContent = message || '';
      statusLine.classList.remove('text-error', 'text-success');
      if (message) {
        statusLine.classList.add(error ? 'text-error' : 'text-success');
        statusTimer = setTimeout(() => {
          statusLine.textContent = '';
          statusLine.classList.remove('text-error', 'text-success');
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
      const classCell = document.createElement('td');
      classCell.textContent = cls.name || `Klasse #${cls.id}`;
      row.appendChild(classCell);

      const hoursCell = document.createElement('td');
      const hoursInput = document.createElement('input');
      hoursInput.type = 'number';
      hoursInput.min = '0';
      hoursInput.placeholder = '0';
      hoursInput.className = 'input input-bordered input-sm w-24';
      hoursInput.value = rowState.hours !== '' ? rowState.hours : '';
      hoursCell.appendChild(hoursInput);
      row.appendChild(hoursCell);

      const doubleCell = document.createElement('td');
      const doubleSelect = document.createElement('select');
      doubleSelect.className = 'select select-bordered select-sm w-full';
      doubleSelect.innerHTML = CURRICULUM_DOPPEL_OPTIONS.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
      doubleSelect.value = rowState.doppelstunde || '';
      doubleCell.appendChild(doubleSelect);
      row.appendChild(doubleCell);

      const afternoonCell = document.createElement('td');
      const afternoonSelect = document.createElement('select');
      afternoonSelect.className = 'select select-bordered select-sm w-full';
      afternoonSelect.innerHTML = CURRICULUM_NACHMITTAG_OPTIONS.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
      afternoonSelect.value = rowState.nachmittag || '';
      afternoonCell.appendChild(afternoonSelect);
      row.appendChild(afternoonCell);

      const participationCell = document.createElement('td');
      const participationSelect = document.createElement('select');
      participationSelect.className = 'select select-bordered select-sm w-full';
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
    footer.className = 'px-6 py-3 border-t border-base-200 flex items-center justify-between text-xs';
    const legend = document.createElement('p');
    legend.className = 'opacity-70';
    legend.textContent = 'Leere Stunden löschen den Eintrag. Einstellungen ohne Eintrag nutzen die Fach-Standards.';
    const closeFooterBtn = document.createElement('button');
    closeFooterBtn.className = 'btn btn-sm';
    closeFooterBtn.type = 'button';
    closeFooterBtn.textContent = 'Schließen';
    footer.append(legend, closeFooterBtn);

    modal.append(header, content, statusLine, footer);
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
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input input-bordered input-sm w-full';
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

  function subjectEnumCell(subject, field, options, setStatusFn, clearStatusFn) {
    const td = document.createElement('td');
    const select = document.createElement('select');
    select.className = 'select select-bordered select-sm w-full';
    select.innerHTML = options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
    const currentValue = subject[field] || '';
    select.value = currentValue;
    select.addEventListener('change', async () => {
      const selected = select.value || '';
      const normalized = selected === '' ? null : selected;
      if ((subject[field] ?? null) === normalized) return;
      setStatusFn('Speichere…');
      try {
        const updated = await updateSubject(subject.id, { [field]: normalized });
        Object.assign(subject, updated);
        setStatusFn('Gespeichert.');
        setTimeout(clearStatusFn, 1500);
      } catch (err) {
        setStatusFn(`Fehler: ${formatError(err)}`, true);
        select.value = subject[field] || '';
      }
    });
    td.appendChild(select);
    return td;
  }

  function subjectRoomCell(subject, rooms, setStatusFn, clearStatusFn) {
    const td = document.createElement('td');
    const select = document.createElement('select');
    select.className = 'select select-bordered select-sm w-full';
    const noneOption = '<option value="">Kein Pflicht-Raum</option>';
    const roomOptions = rooms.map(room => `<option value="${room.id}">${room.name}</option>`).join('');
    select.innerHTML = `${noneOption}${roomOptions}`;
    select.value = subject.required_room_id || '';
    select.addEventListener('change', async () => {
      const rawValue = select.value;
      const normalized = rawValue ? Number(rawValue) : null;
      if ((subject.required_room_id ?? null) === normalized) return;
      setStatusFn('Speichere…');
      try {
        const updated = await updateSubject(subject.id, { required_room_id: normalized });
        Object.assign(subject, updated);
        setStatusFn('Gespeichert.');
        setTimeout(clearStatusFn, 1500);
      } catch (err) {
        setStatusFn(`Fehler: ${formatError(err)}`, true);
        select.value = subject.required_room_id || '';
      }
    });
    td.appendChild(select);
    return td;
  }

  function subjectBandCheckboxCell(subject, setStatusFn, clearStatusFn) {
    const td = document.createElement('td');
    const label = document.createElement('label');
    label.className = 'label justify-center cursor-pointer';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checkbox checkbox-sm';
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
    const label = document.createElement('label');
    label.className = 'label justify-center cursor-pointer';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checkbox checkbox-sm';
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

  function subjectAliasCell(subject, subjects, setStatusFn, clearStatusFn) {
    const td = document.createElement('td');
    const select = document.createElement('select');
    select.className = 'select select-bordered select-sm w-full';
    populateAliasSelect(select, subjects, subject.id);
    select.value = subject.alias_subject_id || '';
    select.addEventListener('change', async () => {
      const rawValue = select.value;
      const normalized = rawValue ? Number(rawValue) : null;
      if (normalized === subject.id) {
        select.value = subject.alias_subject_id || '';
        return;
      }
      if ((subject.alias_subject_id ?? null) === normalized) return;
      setStatusFn('Speichere…');
      try {
        const updated = await updateSubject(subject.id, { alias_subject_id: normalized });
        Object.assign(subject, updated);
        setStatusFn('Gespeichert.');
        setTimeout(clearStatusFn, 1500);
      } catch (err) {
        setStatusFn(`Fehler: ${formatError(err)}`, true);
        select.value = subject.alias_subject_id || '';
      }
    });
    td.appendChild(select);
    return td;
  }

  function subjectActionCell(subject, setStatusFn, clearStatusFn, reloadFn) {
    const td = document.createElement('td');
    td.className = 'text-right';
    const actionWrap = document.createElement('div');
    actionWrap.className = 'flex justify-end gap-2';

    const configBtn = document.createElement('button');
    configBtn.className = 'btn btn-secondary btn-sm';
    configBtn.textContent = 'Stundentafel';
    configBtn.addEventListener('click', () => openSubjectConfigModal(subject));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-ghost btn-sm text-error';
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

  function newSubjectRow(onRefresh, setStatusFn, clearStatusFn, rooms) {
    const tr = document.createElement('tr');
    tr.className = 'bg-base-200/60';

    const draft = {
      name: '',
      kuerzel: '',
      color: '',
      default_doppelstunde: '',
      default_nachmittag: '',
      required_room_id: null,
      is_bandfach: false,
      is_ag_foerder: false,
      alias_subject_id: null,
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

    const colorCell = subjectDraftInput('Farbe', value => {
      draft.color = value;
    });
    tr.appendChild(colorCell);

    const dsCell = document.createElement('td');
    const dsSelect = document.createElement('select');
    dsSelect.className = 'select select-bordered select-sm w-full';
    dsSelect.innerHTML = SUBJECT_DOPPEL_OPTIONS.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
    dsSelect.addEventListener('change', () => {
      draft.default_doppelstunde = dsSelect.value;
    });
    dsCell.appendChild(dsSelect);
    tr.appendChild(dsCell);

    const nmCell = document.createElement('td');
    const nmSelect = document.createElement('select');
    nmSelect.className = 'select select-bordered select-sm w-full';
    nmSelect.innerHTML = SUBJECT_NACHMITTAG_OPTIONS.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
    nmSelect.addEventListener('change', () => {
      draft.default_nachmittag = nmSelect.value;
    });
    nmCell.appendChild(nmSelect);
    tr.appendChild(nmCell);

    const roomCell = document.createElement('td');
    const roomSelect = document.createElement('select');
    roomSelect.className = 'select select-bordered select-sm w-full';
    const noneOption = '<option value="">Kein Pflicht-Raum</option>';
    const roomOptions = rooms.map(room => `<option value="${room.id}">${room.name}</option>`).join('');
    roomSelect.innerHTML = `${noneOption}${roomOptions}`;
    roomSelect.addEventListener('change', () => {
      draft.required_room_id = roomSelect.value ? Number(roomSelect.value) : null;
    });
    roomCell.appendChild(roomSelect);
    tr.appendChild(roomCell);

    const bandCell = document.createElement('td');
    const bandLabel = document.createElement('label');
    bandLabel.className = 'label justify-center cursor-pointer';
    const bandCheckbox = document.createElement('input');
    bandCheckbox.type = 'checkbox';
    bandCheckbox.className = 'checkbox checkbox-sm';
    bandCheckbox.addEventListener('change', () => {
      draft.is_bandfach = bandCheckbox.checked;
    });
    bandLabel.appendChild(bandCheckbox);
    bandCell.appendChild(bandLabel);
    tr.appendChild(bandCell);

    const agCell = document.createElement('td');
    const agLabel = document.createElement('label');
    agLabel.className = 'label justify-center cursor-pointer';
    const agCheckbox = document.createElement('input');
    agCheckbox.type = 'checkbox';
    agCheckbox.className = 'checkbox checkbox-sm';
    agCheckbox.addEventListener('change', () => {
      draft.is_ag_foerder = agCheckbox.checked;
    });
    agLabel.appendChild(agCheckbox);
    agCell.appendChild(agLabel);
    tr.appendChild(agCell);

    const aliasCell = document.createElement('td');
    const aliasSelect = document.createElement('select');
    aliasSelect.className = 'select select-bordered select-sm w-full';
    populateAliasSelect(aliasSelect, state.subjects);
    aliasSelect.addEventListener('change', () => {
      draft.alias_subject_id = aliasSelect.value ? Number(aliasSelect.value) : null;
    });
    aliasCell.appendChild(aliasSelect);
    tr.appendChild(aliasCell);

    const actionCell = document.createElement('td');
    actionCell.className = 'text-right';
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary btn-sm';
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
          default_doppelstunde: draft.default_doppelstunde || null,
          default_nachmittag: draft.default_nachmittag || null,
          required_room_id: draft.required_room_id,
          is_bandfach: draft.is_bandfach,
          is_ag_foerder: draft.is_ag_foerder,
          alias_subject_id: draft.alias_subject_id,
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

    return tr;
  }

  function subjectDraftInput(placeholder, onChange) {
    const td = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.className = 'input input-bordered input-sm w-full';
    input.addEventListener('input', () => {
      onChange(input.value.trim());
    });
    td.appendChild(input);
    return td;
  }
}

// --- Räume ---
function createRoomsSection() {
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
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'input input-bordered input-sm w-full';
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
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'input input-bordered input-sm w-full';
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
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.className = 'input input-bordered input-sm w-24';
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
  const label = document.createElement('label');
  label.className = 'label justify-center cursor-pointer';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'checkbox checkbox-sm';
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
  td.className = 'text-right';
  const btn = document.createElement('button');
  btn.className = 'btn btn-ghost btn-sm text-error';
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
  tr.className = 'bg-base-200/60';

  const draft = {
    name: '',
    type: '',
    capacity: '',
    is_classroom: false,
  };

  const nameCell = document.createElement('td');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'input input-bordered input-sm w-full';
  nameInput.placeholder = 'Raumname*';
  nameInput.addEventListener('input', () => {
    draft.name = nameInput.value.trim();
    updateButtonState();
  });
  nameCell.appendChild(nameInput);
  tr.appendChild(nameCell);

  const typeCell = document.createElement('td');
  const typeInput = document.createElement('input');
  typeInput.type = 'text';
  typeInput.className = 'input input-bordered input-sm w-full';
  typeInput.placeholder = 'Typ';
  typeInput.addEventListener('input', () => {
    draft.type = typeInput.value.trim();
  });
  typeCell.appendChild(typeInput);
  tr.appendChild(typeCell);

  const capacityCell = document.createElement('td');
  const capacityInput = document.createElement('input');
  capacityInput.type = 'number';
  capacityInput.min = '0';
  capacityInput.className = 'input input-bordered input-sm w-24';
  capacityInput.placeholder = '0';
  capacityInput.addEventListener('input', () => {
    draft.capacity = capacityInput.value;
  });
  capacityCell.appendChild(capacityInput);
  tr.appendChild(capacityCell);

  const classroomCell = document.createElement('td');
  const label = document.createElement('label');
  label.className = 'label justify-center cursor-pointer';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'checkbox checkbox-sm';
  checkbox.addEventListener('change', () => {
    draft.is_classroom = checkbox.checked;
  });
  label.appendChild(checkbox);
  classroomCell.appendChild(label);
  tr.appendChild(classroomCell);

  const actionCell = document.createElement('td');
  actionCell.className = 'text-right';
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary btn-sm';
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
function createCurriculumSection() {
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
    headerRow.className = 'align-bottom';

    const subjectHeader = document.createElement('th');
    subjectHeader.className = 'align-bottom';
    const subjectLabel = document.createElement('span');
    subjectLabel.className = 'text-xs uppercase opacity-60';
    subjectLabel.textContent = 'Fach';
    subjectHeader.appendChild(subjectLabel);
    headerRow.appendChild(subjectHeader);

    state.classes.forEach(cls => {
      const th = document.createElement('th');
      th.className = 'align-bottom';

      const wrapper = document.createElement('div');
      wrapper.className = 'flex flex-col gap-2 items-stretch text-left';

      const totalBadge = document.createElement('span');
      totalBadge.className = 'badge badge-neutral badge-sm self-start';
      totalBadge.dataset.classTotal = String(cls.id);
      const totals = getClassTotals(cls.id);
      totalBadge.textContent = totals.optional > 0 ? `${totals.mandatory} h (+${totals.optional} h AG)` : `${totals.mandatory} h`;

      const label = document.createElement('span');
      label.className = 'text-xs uppercase opacity-60';
      label.textContent = cls.name;

      wrapper.append(totalBadge, label);
      th.appendChild(wrapper);
      headerRow.appendChild(th);
    });
    table.thead.appendChild(headerRow);

    state.subjects.forEach(sub => {
      const tr = document.createElement('tr');
      const subjectCell = document.createElement('td');
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
    const key = `${classId}|${subjectId}`;
    const entry = state.entries.get(key);

    const wrapper = document.createElement('div');
    wrapper.className = 'flex items-center gap-2';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.className = 'input input-bordered input-sm w-20';
    input.value = entry?.wochenstunden ?? '';
    input.placeholder = '0';

    const select = document.createElement('select');
    select.className = 'select select-bordered select-xs';
    select.innerHTML = CURRICULUM_PARTICIPATION_OPTIONS.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
    select.value = entry?.participation || 'curriculum';
    select.disabled = !entry;

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-ghost btn-xs text-error';
    deleteBtn.textContent = '✕';
    deleteBtn.title = 'Eintrag löschen';
    deleteBtn.disabled = !entry;

    let suppressBlur = false;

    input.addEventListener('blur', () => {
      if (suppressBlur) {
        suppressBlur = false;
        return;
      }
      handleCurriculumChange(key, { hoursRaw: input.value, participation: select.value }, { input, deleteBtn, select });
    });

    input.addEventListener('keydown', evt => {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        input.blur();
      }
    });

    select.addEventListener('change', async () => {
      suppressBlur = true;
      await handleCurriculumChange(key, { hoursRaw: input.value, participation: select.value }, { input, deleteBtn, select });
      suppressBlur = false;
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
      await handleCurriculumDelete(key, { input, deleteBtn, select });
    });

    wrapper.append(input, select, deleteBtn);
    td.appendChild(wrapper);
    return td;
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
      if (controls?.select && current) {
        controls.select.value = current.participation || 'curriculum';
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
        if (controls?.select) {
          controls.select.disabled = false;
          controls.select.value = normalized.participation;
        }
        if (controls?.input) controls.input.value = normalized.wochenstunden ?? '';
        setStatus('Aktualisiert.');
        updateClassTotalDisplay(normalized.class_id ?? current.class_id ?? classId);
        setTimeout(clearStatus, 1500);
      } catch (err) {
        setStatus(`Fehler: ${formatError(err)}`, true);
        if (controls?.input) controls.input.value = current.wochenstunden ?? '';
        if (controls?.select) controls.select.value = currentParticipation;
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
        if (controls?.select) {
          controls.select.disabled = false;
          controls.select.value = normalized.participation;
        }
        setStatus('Eintrag angelegt.');
        updateClassTotalDisplay(classId);
        setTimeout(clearStatus, 1500);
      } catch (err) {
        setStatus(`Fehler: ${formatError(err)}`, true);
        if (controls?.input) controls.input.value = '';
        if (controls?.select) controls.select.value = 'curriculum';
      }
    }
  }

  async function handleCurriculumDelete(key, controls) {
    const current = state.entries.get(key);
    if (!current) {
      if (controls?.input) controls.input.value = '';
      if (controls?.deleteBtn) controls.deleteBtn.disabled = true;
      if (controls?.select) {
        controls.select.value = 'curriculum';
        controls.select.disabled = true;
      }
      return;
    }
    setStatus('Lösche Eintrag…');
    try {
      await deleteCurriculum(current.id);
      state.entries.delete(key);
      if (controls?.input) controls.input.value = '';
      if (controls?.deleteBtn) controls.deleteBtn.disabled = true;
      if (controls?.select) {
        controls.select.value = 'curriculum';
        controls.select.disabled = true;
      }
      setStatus('Eintrag gelöscht.');
      updateClassTotalDisplay(current.class_id);
      setTimeout(clearStatus, 1500);
    } catch (err) {
      setStatus(`Fehler: ${formatError(err)}`, true);
      if (controls?.input) controls.input.value = current.wochenstunden ?? '';
      if (controls?.deleteBtn) controls.deleteBtn.disabled = false;
      if (controls?.select) controls.select.value = current.participation || 'curriculum';
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
  wrapper.className = 'overflow-x-auto bg-base-100 shadow rounded-xl';

  const table = document.createElement('table');
  table.className = 'table table-zebra';
  wrapper.appendChild(table);

  const thead = document.createElement('thead');
  if (headers.length) {
    const tr = document.createElement('tr');
    tr.className = 'text-xs uppercase opacity-60';
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
  };
}
