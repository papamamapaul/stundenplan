import { fetchTeachers, updateTeacher, createTeacher } from '../api/teachers.js';
import { fetchClasses, createClass, updateClass } from '../api/classes.js';
import { fetchRooms, createRoom, updateRoom, deleteRoom } from '../api/rooms.js';
import { fetchSubjects } from '../api/subjects.js';
import { fetchCurriculum, createCurriculum, updateCurriculum, deleteCurriculum } from '../api/curriculum.js';

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
    if (activeSection?.destroy) activeSection.destroy();
    sectionWrap.innerHTML = '';

    if (id === 'teachers') activeSection = createTeachersSection();
    if (id === 'classes') activeSection = createClassesSection();
    if (id === 'rooms') activeSection = createRoomsSection();
    if (id === 'curriculum') activeSection = createCurriculumSection();

    if (activeSection?.element) sectionWrap.appendChild(activeSection.element);
  }

  switchSection('teachers');
  return container;
}

// --- Lehrer ---
function createTeachersSection() {
  const wrap = document.createElement('div');
  wrap.className = 'space-y-3';

  const status = createStatusBar();
  wrap.appendChild(status.element);

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
      setStatus(`Fehler beim Laden: ${err.message || err}`, true);
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
        document.createElement('td')
      );
      table.tbody.appendChild(tr);
    });
    table.tbody.appendChild(newTeacherRow(loadTeachers, setStatus, clearStatus));
  }

  loadTeachers();
  return { element: wrap };
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
    const payload = { [field]: newValue };
    if (['first_name', 'last_name', 'kuerzel'].includes(field)) {
      payload.name = buildTeacherName({ ...teacher, ...payload });
    }
    setStatus('Speichere…');
    try {
      const updated = await updateTeacher(teacher.id, payload);
      Object.assign(teacher, updated);
      setStatus('Gespeichert.');
      setTimeout(clearStatus, 1500);
    } catch (err) {
      setStatus(`Fehler: ${err.message || err}`, true);
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
    setStatus('Speichere…');
    try {
      const updated = await updateTeacher(teacher.id, { [field]: checkbox.checked });
      Object.assign(teacher, updated);
      setStatus('Gespeichert.');
      setTimeout(clearStatus, 1500);
    } catch (err) {
      setStatus(`Fehler: ${err.message || err}`, true);
    }
  });
  const label = document.createElement('label');
  label.className = 'label justify-center cursor-pointer';
  label.appendChild(checkbox);
  td.appendChild(label);
  return td;
}

function newTeacherRow(onRefresh, setStatus, clearStatus) {
  const tr = document.createElement('tr');
  tr.className = 'bg-base-200/60';

  const draft = {
    first_name: '',
    last_name: '',
    kuerzel: '',
    deputat_soll: '',
    deputat: '',
    work_mo: true,
    work_di: true,
    work_mi: true,
    work_do: true,
    work_fr: true,
  };

  const fields = ['first_name', 'last_name', 'kuerzel', 'deputat_soll', 'deputat'];
  fields.forEach(field => {
    const td = document.createElement('td');
    const input = document.createElement('input');
    input.type = field.includes('deputat') ? 'number' : 'text';
    input.min = '0';
    input.className = 'input input-bordered input-sm w-full';
    input.placeholder = field === 'kuerzel' ? 'Kürzel*' : '';
    input.addEventListener('input', () => {
      draft[field] = normalizeValue(input.type, input.value);
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
      setStatus(`Fehler: ${err.message || err}`, true);
    } finally {
      addBtn.disabled = false;
    }
  });
  actionCell.appendChild(addBtn);
  tr.appendChild(actionCell);

  function updateButtonState() {
    const hasKuerzel = draft.kuerzel && draft.kuerzel.toString().trim().length >= 2;
    const hasDeputat = draft.deputat_soll !== '' && !Number.isNaN(Number(draft.deputat_soll));
    addBtn.disabled = !(hasKuerzel && hasDeputat);
  }

  return tr;
}

// --- Klassen ---
function createClassesSection() {
  const wrap = document.createElement('div');
  wrap.className = 'space-y-3';

  const status = createStatusBar();
  wrap.appendChild(status.element);

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
      setStatus(`Fehler beim Laden: ${err.message || err}`, true);
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
          setStatus(`Fehler: ${err.message || err}`, true);
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
          setStatus(`Fehler: ${err.message || err}`, true);
        }
      });
      teacherCell.appendChild(select);
      tr.appendChild(teacherCell);

      tr.appendChild(document.createElement('td'));
      table.tbody.appendChild(tr);
    });

    table.tbody.appendChild(newClassRow(loadClasses, setStatus, clearStatus, teacherOptions));
  }

  loadClasses();
  return { element: wrap };
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
      setStatus(`Fehler: ${err.message || err}`, true);
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

// --- Stundentafel ---
function createCurriculumSection() {
  const wrap = document.createElement('div');
  wrap.className = 'space-y-3';

  const status = createStatusBar();
  wrap.appendChild(status.element);

  const table = createTable([]);
  wrap.appendChild(table.wrapper);

  const state = {
    classes: [],
    subjects: [],
    entries: new Map(),
  };

  const setStatus = status.set;
  const clearStatus = status.clear;

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
      state.entries = new Map(curriculum.map(entry => [`${entry.class_id}|${entry.subject_id}`, entry]));
      renderTable();
      setStatus('Stundentafel geladen.');
      setTimeout(clearStatus, 2000);
    } catch (err) {
      setStatus(`Fehler beim Laden: ${err.message || err}`, true);
    }
  }

  function renderTable() {
    table.thead.innerHTML = '';
    table.tbody.innerHTML = '';

    const headerRow = document.createElement('tr');
    headerRow.className = 'text-xs uppercase opacity-60';
    headerRow.appendChild(createHeaderCell('Fach'));
    state.classes.forEach(cls => headerRow.appendChild(createHeaderCell(cls.name)));
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
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.className = 'input input-bordered input-sm w-20';
    input.value = entry?.wochenstunden ?? '';
    input.placeholder = '0';
    input.addEventListener('blur', () => handleCurriculumChange(key, entry, input.value));
    td.appendChild(input);
    return td;
  }

  async function handleCurriculumChange(key, entry, rawValue) {
    const value = rawValue === '' ? null : Number(rawValue);
    if (value === null || Number.isNaN(value) || value <= 0) {
      if (entry) {
        setStatus('Lösche Eintrag…');
        try {
          await deleteCurriculum(entry.id);
          state.entries.delete(key);
          setStatus('Eintrag gelöscht.');
          setTimeout(clearStatus, 1500);
        } catch (err) {
          setStatus(`Fehler: ${err.message || err}`, true);
        }
      }
      return;
    }

    if (entry) {
      if (entry.wochenstunden === value) return;
      setStatus('Aktualisiere Eintrag…');
      try {
        const updated = await updateCurriculum(entry.id, { wochenstunden: value });
        state.entries.set(key, updated);
        setStatus('Aktualisiert.');
        setTimeout(clearStatus, 1500);
      } catch (err) {
        setStatus(`Fehler: ${err.message || err}`, true);
      }
    } else {
      const [classId, subjectId] = key.split('|').map(Number);
      setStatus('Lege Eintrag an…');
      try {
        const created = await createCurriculum({ class_id: classId, subject_id: subjectId, wochenstunden: value });
        state.entries.set(key, created);
        setStatus('Eintrag angelegt.');
        setTimeout(clearStatus, 1500);
      } catch (err) {
        setStatus(`Fehler: ${err.message || err}`, true);
      }
    }
  }

  loadData();
  return { element: wrap };
}

// --- Helper ---
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

function buildCreateTeacher(draft) {
  return {
    first_name: draft.first_name?.trim() || null,
    last_name: draft.last_name?.trim() || null,
    kuerzel: draft.kuerzel?.trim(),
    deputat_soll: draft.deputat_soll !== '' ? Number(draft.deputat_soll) : null,
    deputat: draft.deputat !== '' ? Number(draft.deputat) : null,
    work_mo: draft.work_mo,
    work_di: draft.work_di,
    work_mi: draft.work_mi,
    work_do: draft.work_do,
    work_fr: draft.work_fr,
    name: buildTeacherName(draft),
  };
}
