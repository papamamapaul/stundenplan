import { fetchTeachers } from '../api/teachers.js';
import { fetchClasses } from '../api/classes.js';
import { fetchSubjects } from '../api/subjects.js';
import { fetchCurriculum } from '../api/curriculum.js';
import { fetchRooms } from '../api/rooms.js';
import { fetchVersions, createVersion, updateVersion, deleteVersion } from '../api/versions.js';
import { fetchRequirements, createRequirement, updateRequirement, deleteRequirement } from '../api/requirements.js';
import { confirmModal, formModal, formatError } from '../utils/ui.js';
import { getActivePlanningPeriod } from '../store/planningPeriods.js';
import { createTeacherBadge } from '../components/TeacherBadge.js';
import { createIcon, ICONS } from '../components/icons.js';

export function createDistributionView() {
  const container = document.createElement('section');
  container.className = 'space-y-6';

  const header = document.createElement('div');
  header.className = 'space-y-1';
  header.innerHTML = `
    <h1 class="text-2xl font-semibold text-gray-900">Stundenverteilung</h1>
    <p class="text-sm text-gray-600">Verteile die Wochenstunden auf Lehrkräfte und verwalte verschiedene Varianten.</p>
  `;
  const periodInfo = document.createElement('p');
  periodInfo.className = 'text-xs text-gray-500';
  const activePeriod = getActivePlanningPeriod();
  periodInfo.textContent = activePeriod
    ? `Aktive Planungsperiode: ${activePeriod.name}`
    : 'Keine Planungsperiode ausgewählt.';
  header.appendChild(periodInfo);
  container.appendChild(header);

  const toolbar = document.createElement('div');
  toolbar.className = 'flex flex-wrap items-center gap-3';

  const createBtn = document.createElement('button');
  createBtn.type = 'button';
  createBtn.className = 'inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1';
  createBtn.textContent = 'Neue Stundenverteilung anlegen';
  toolbar.appendChild(createBtn);
  container.appendChild(toolbar);

  const status = createStatusBar();
  container.appendChild(status.element);

  const layout = document.createElement('div');
  layout.className = 'space-y-6';
  container.appendChild(layout);

  const versionsSection = document.createElement('div');
  versionsSection.className = 'space-y-3';
  layout.appendChild(versionsSection);

  const boardSection = document.createElement('div');
  layout.appendChild(boardSection);

  const state = {
    versions: [],
    selectedVersionId: null,
    selectedTeacherId: null,
    teachers: [],
    classes: [],
    subjects: [],
    curriculum: [],
    requirements: [],
    loading: false,
    collapsedClasses: new Set(),
    teacherSort: 'name',
    showOnlyWithCapacity: false,
    teacherSearchTerm: '',
    rooms: [],
  };

  const maps = {
    classes: new Map(),
    subjects: new Map(),
    teachers: new Map(),
  };

const DOPPEL_OPTIONS = [
  { value: 'muss', label: 'Muss Doppelstunde' },
  { value: 'soll', label: 'Soll Doppelstunde' },
  { value: 'kann', label: 'Darf Einzelstunde' },
  { value: 'nein', label: 'Nur Einzelstunden' },
];

const NACHMITTAG_OPTIONS = [
  { value: 'muss', label: 'Muss am Nachmittag' },
  { value: 'kann', label: 'Kann am Nachmittag' },
  { value: 'nein', label: 'Kein Nachmittag' },
];

const PARTICIPATION_OPTIONS = [
  { value: 'curriculum', label: 'Pflicht (Curriculum)' },
  { value: 'ag', label: 'Freiwillig (AG/Förder)' },
];

function labelForOption(options, value) {
  const opt = options.find(o => o.value === value);
  return opt ? opt.label : value;
}


  let currentDragPayload = null;

  const setStatus = status.set;
  const clearStatus = status.clear;

  createBtn.addEventListener('click', async () => {
    const values = await formModal({
      title: 'Neue Stundenverteilung',
      message: 'Bitte Titel und optional einen Kommentar eingeben.',
      confirmText: 'Anlegen',
      fields: [
        { name: 'name', label: 'Titel*', required: true, placeholder: 'z. B. Schuljahr 24/25 – Version A' },
        { name: 'comment', label: 'Kommentar', type: 'textarea', placeholder: 'Optionaler Hinweis (z. B. Fokus, Besonderheiten)' },
      ],
      validate: ({ name }) => {
        if (!name) return 'Bitte einen Titel angeben.';
        if (name.length < 3) return 'Der Titel muss mindestens 3 Zeichen besitzen.';
        return null;
      },
    });
    if (!values) return;

    setStatus('Erstelle neue Version…');
    try {
      const created = await createVersion({ name: values.name, comment: values.comment || null });
      state.versions.push(created);
      state.selectedVersionId = created.id;
      renderVersions();
      await loadRequirements();
      setStatus('Version angelegt.');
      setTimeout(clearStatus, 1500);
    } catch (err) {
      setStatus(`Fehler: ${formatError(err)}`, true);
    }
  });

  async function initialize() {
    setStatus('Lade Stammdaten…');
    try {
      const [teachers, classes, subjects, curriculum, versions, rooms] = await Promise.all([
        fetchTeachers(),
        fetchClasses(),
        fetchSubjects(),
        fetchCurriculum(),
        fetchVersions(),
        fetchRooms(),
      ]);
      state.teachers = teachers;
      state.classes = classes;
      state.subjects = subjects;
      state.curriculum = curriculum.map(entry => ({
        ...entry,
        participation: entry.participation || 'curriculum',
        doppelstunde: entry.doppelstunde || null,
        nachmittag: entry.nachmittag || null,
      }));
      state.versions = versions;
      state.rooms = rooms;
      state.collapsedClasses = new Set(
        [...state.collapsedClasses].filter(id => classes.some(c => c.id === id))
      );
      if (state.selectedTeacherId && !teachers.some(t => t.id === state.selectedTeacherId)) {
        state.selectedTeacherId = null;
      }

      maps.classes = new Map(classes.map(item => [item.id, item]));
      maps.subjects = new Map(subjects.map(item => [item.id, item]));
      maps.teachers = new Map(teachers.map(item => [item.id, item]));

      state.selectedVersionId = versions[0]?.id ?? null;

      renderVersions();
      await loadRequirements();
      if (!state.selectedVersionId) {
        boardSection.innerHTML = '';
        boardSection.appendChild(createEmptyState());
      }
      setStatus('Stammdaten geladen.');
      setTimeout(clearStatus, 1500);
    } catch (err) {
      setStatus(`Fehler beim Laden: ${formatError(err)}`, true);
    }
  }

  function createEmptyState() {
    const wrap = document.createElement('div');
    wrap.className = 'rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center shadow-sm';
    const title = document.createElement('h2');
    title.className = 'text-lg font-semibold text-gray-900';
    title.textContent = 'Noch keine Stundenverteilung vorhanden';
    const message = document.createElement('p');
    message.className = 'mt-2 text-sm text-gray-500';
    message.textContent = 'Lege eine neue Version an, um mit der Verteilung zu starten.';
    wrap.append(title, message);
    return wrap;
  }

  async function loadRequirements() {
    if (!state.selectedVersionId) {
      state.requirements = [];
      renderBoard();
      return;
    }
    setStatus('Lade Zuweisungen…');
    try {
      const data = await fetchRequirements({ version_id: state.selectedVersionId });
      state.requirements = data;
      renderBoard();
      setStatus('Zuweisungen geladen.');
      setTimeout(clearStatus, 1500);
    } catch (err) {
      setStatus(`Fehler: ${formatError(err)}`, true);
    }
  }

  function renderVersions() {
    versionsSection.innerHTML = '';
    const heading = document.createElement('div');
    heading.className = 'flex items-center justify-between';
    const headingTitle = document.createElement('h2');
    headingTitle.className = 'text-lg font-semibold text-gray-900';
    headingTitle.textContent = 'Versionen';
    heading.appendChild(headingTitle);
    versionsSection.appendChild(heading);

    if (!state.versions.length) {
      const empty = document.createElement('p');
      empty.className = 'text-sm text-gray-500';
      empty.textContent = 'Noch keine Versionen vorhanden.';
      versionsSection.appendChild(empty);
      return;
    }

    const list = document.createElement('div');
    list.className = 'grid gap-3 md:grid-cols-2 xl:grid-cols-3';
    versionsSection.appendChild(list);

    state.versions.forEach(version => {
      const active = version.id === state.selectedVersionId;
      const card = document.createElement('article');
      card.className = [
        'rounded-xl border transition-shadow',
        active ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 bg-white shadow-sm hover:shadow-md',
      ].join(' ');

      const body = document.createElement('div');
      body.className = 'p-4 flex flex-col gap-3';
      card.appendChild(body);

      const titleRow = document.createElement('div');
      titleRow.className = 'flex items-start justify-between gap-3';
      body.appendChild(titleRow);

      const titleBlock = document.createElement('div');
      const titleEl = document.createElement('h3');
      titleEl.className = 'text-sm font-semibold text-gray-900';
      titleEl.textContent = version.name;
      titleBlock.appendChild(titleEl);
      if (version.comment) {
        const commentEl = document.createElement('p');
        commentEl.className = 'mt-1 text-xs text-gray-500';
        commentEl.textContent = version.comment;
        titleBlock.appendChild(commentEl);
      }
      titleRow.appendChild(titleBlock);

      const actionWrap = document.createElement('div');
      actionWrap.className = 'flex items-center gap-2';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'inline-flex items-center px-2.5 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-md hover:text-gray-900 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1';
      editBtn.textContent = 'Bearbeiten';

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'inline-flex items-center px-2.5 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:text-red-700 hover:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1';
      deleteBtn.textContent = 'Löschen';

      actionWrap.append(editBtn, deleteBtn);
      titleRow.appendChild(actionWrap);

      const meta = document.createElement('div');
      meta.className = 'flex items-center justify-between text-xs text-gray-500';
      const versionIdLabel = document.createElement('span');
      versionIdLabel.textContent = `#${version.id}`;
      const dateLabel = document.createElement('span');
      dateLabel.textContent = formatDate(version.updated_at || version.created_at);
      meta.append(versionIdLabel, dateLabel);
      body.appendChild(meta);

      const selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      selectBtn.className = [
        'inline-flex items-center justify-center px-3 py-1.5 text-xs font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-offset-1',
        active ? 'bg-blue-600 text-white hover:bg-blue-500 focus:ring-blue-500' : 'border border-gray-200 text-gray-700 hover:text-gray-900 hover:border-gray-300 focus:ring-blue-500',
      ].join(' ');
      selectBtn.textContent = active ? 'Aktiv' : 'Auswählen';
      body.appendChild(selectBtn);

      list.appendChild(card);

      selectBtn.addEventListener('click', async () => {
        if (state.selectedVersionId === version.id) return;
        state.selectedVersionId = version.id;
        renderVersions();
        await loadRequirements();
      });

      editBtn.addEventListener('click', async () => {
        const values = await formModal({
          title: 'Version bearbeiten',
          message: 'Passe Titel oder Kommentar an.',
          confirmText: 'Speichern',
          fields: [
            { name: 'name', label: 'Titel*', required: true, value: version.name },
            { name: 'comment', label: 'Kommentar', type: 'textarea', value: version.comment ?? '' },
          ],
          validate: ({ name }) => {
            if (!name) return 'Bitte einen Titel angeben.';
            if (name.length < 3) return 'Der Titel muss mindestens 3 Zeichen besitzen.';
            return null;
          },
        });
        if (!values) return;
        setStatus('Speichere Version…');
        try {
          const updated = await updateVersion(version.id, { name: values.name, comment: values.comment || null });
          Object.assign(version, updated);
          renderVersions();
          setStatus('Version aktualisiert.');
          setTimeout(clearStatus, 1500);
        } catch (err) {
          setStatus(`Fehler: ${formatError(err)}`, true);
        }
      });

      deleteBtn.addEventListener('click', async () => {
        const confirmed = await confirmModal({
          title: 'Version löschen',
          message: `Version "${version.name}" wirklich löschen?`,
          confirmText: 'Löschen',
        });
        if (!confirmed) return;
        setStatus('Lösche Version…');
        try {
          await deleteVersion(version.id);
          state.versions = state.versions.filter(v => v.id !== version.id);
          if (state.selectedVersionId === version.id) {
            state.selectedVersionId = state.versions[0]?.id ?? null;
            await loadRequirements();
          }
          renderVersions();
          setStatus('Version gelöscht.');
          setTimeout(clearStatus, 1500);
        } catch (err) {
          setStatus(`Fehler: ${formatError(err)}`, true);
        }
      });
    });
  }

  function renderBoard() {
    boardSection.innerHTML = '';

    if (!state.selectedVersionId) {
      boardSection.appendChild(createEmptyState());
      return;
    }

    const remainingMap = computeRemainingMap();
    const assignmentsByTeacher = groupAssignmentsByTeacher();
    const teacherLoads = computeTeacherLoads(assignmentsByTeacher);
    const classSubjectAssignments = groupAssignmentsByClassSubject(assignmentsByTeacher);

    const totals = Array.from(remainingMap.values()).reduce(
      (acc, info) => {
        const total = Number(info.total || 0);
        const remaining = Math.max(0, Number(info.remaining || 0));
        acc.total += total;
        acc.remaining += remaining;
        return acc;
      },
      { total: 0, remaining: 0 }
    );
    const assignedHours = Math.max(0, totals.total - totals.remaining);

    const layout = document.createElement('div');
    layout.className = 'flex flex-col gap-4 xl:flex-row xl:items-stretch';

    layout.appendChild(renderTeacherPanel());
    layout.appendChild(renderSubjectPanel());
    const detailsPanel = renderTeacherDetailsPanel();
    if (detailsPanel) {
      layout.appendChild(detailsPanel);
    }

    boardSection.appendChild(layout);

    function renderTeacherPanel() {
      const panel = document.createElement('aside');
      panel.className = 'xl:w-80 w-full bg-white border border-gray-200 rounded-xl flex flex-col shadow-sm';

      const header = document.createElement('div');
      header.className = 'p-4 border-b border-gray-200 space-y-4 bg-white';

      const titleRow = document.createElement('div');
      titleRow.className = 'flex items-center justify-between gap-2';
      const titleWrap = document.createElement('div');
      titleWrap.className = 'flex items-center gap-2 text-sm font-semibold text-gray-900';
      const userIcon = createIcon(ICONS.USER, { size: 16 });
      userIcon.classList.add('text-gray-500');
      titleWrap.append(userIcon, document.createTextNode('Lehrkräfte'));
      const count = document.createElement('span');
      count.className = 'text-xs text-gray-500';
      count.textContent = `${state.teachers.length} Personen`;
      titleRow.append(titleWrap, count);

      const searchWrap = document.createElement('div');
      searchWrap.className = 'relative';

      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.value = state.teacherSearchTerm || '';
      searchInput.placeholder = 'Lehrkraft suchen…';
      searchInput.className = 'w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
      searchInput.addEventListener('input', () => {
        state.teacherSearchTerm = searchInput.value;
        renderTeacherCards();
      });

      const searchIcon = createIcon(ICONS.SEARCH, { size: 16 });
      searchIcon.classList.add('absolute', 'left-3', 'top-1/2', '-translate-y-1/2', 'text-gray-400', 'pointer-events-none');
      searchWrap.append(searchIcon, searchInput);

      const controlsRow = document.createElement('div');
      controlsRow.className = 'flex flex-wrap items-center gap-2';

      const sortBtn = document.createElement('button');
      sortBtn.type = 'button';
      sortBtn.className = 'flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:text-gray-900 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1';
      sortBtn.textContent = state.teacherSort === 'name' ? 'Sortierung: A–Z' : 'Sortierung: Reststunden';
      sortBtn.addEventListener('click', () => {
        state.teacherSort = state.teacherSort === 'name' ? 'remaining' : 'name';
        renderBoard();
      });

      const capacityBtn = document.createElement('button');
      capacityBtn.type = 'button';
      capacityBtn.className = [
        'flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
        state.showOnlyWithCapacity
          ? 'bg-blue-600 text-white hover:bg-blue-500 border border-blue-600'
          : 'text-gray-600 border border-gray-200 hover:text-gray-900 hover:border-gray-300',
      ].join(' ');
      const filterIcon = createIcon(ICONS.FILTER, { size: 14 });
      filterIcon.classList.add('text-current');
      capacityBtn.append(filterIcon, document.createTextNode(state.showOnlyWithCapacity ? 'Nur freie' : 'Alle Lehrkräfte'));
      capacityBtn.addEventListener('click', () => {
        state.showOnlyWithCapacity = !state.showOnlyWithCapacity;
        renderBoard();
      });

      controlsRow.append(sortBtn, capacityBtn);

      header.append(titleRow, searchWrap, controlsRow);
      panel.appendChild(header);

      const listContainer = document.createElement('div');
      listContainer.className = 'flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50';
      panel.appendChild(listContainer);

      const footer = document.createElement('div');
      footer.className = 'border-t border-gray-200 bg-gray-50 p-4 text-xs grid grid-cols-2 gap-2';
      const assignedBox = document.createElement('div');
      assignedBox.className = 'bg-white border border-gray-200 rounded-lg p-3';
      assignedBox.innerHTML = `
        <div class="text-gray-500">Verplant</div>
        <div class="font-semibold text-sm text-gray-900">${assignedHours} h</div>
      `;
      const remainingBox = document.createElement('div');
      remainingBox.className = 'bg-white border border-gray-200 rounded-lg p-3';
      remainingBox.innerHTML = `
        <div class="text-gray-500">Offen</div>
        <div class="font-semibold text-sm ${totals.remaining ? 'text-orange-600' : 'text-green-600'}">${totals.remaining} h</div>
      `;
      footer.append(assignedBox, remainingBox);
      panel.appendChild(footer);

      renderTeacherCards();

      function renderTeacherCards() {
        listContainer.innerHTML = '';
        let teachersList = state.teachers.slice();
        const query = (state.teacherSearchTerm || '').trim().toLowerCase();
        if (query) {
          teachersList = teachersList.filter(t => {
            const name = (t.name || '').toLowerCase();
            const kuerzel = (t.kuerzel || '').toLowerCase();
            return name.includes(query) || kuerzel.includes(query);
          });
        }

        if (state.showOnlyWithCapacity) {
          teachersList = teachersList.filter(teacher => {
            const load = teacherLoads.get(teacher.id) ?? { used: 0, limit: getTeacherLimit(teacher) };
            const remainingCapacity = Number.isFinite(load.limit) ? load.limit - load.used : Infinity;
            return remainingCapacity > 0 || !Number.isFinite(load.limit);
          });
        }

        if (state.teacherSort === 'remaining') {
          teachersList.sort((a, b) => {
            const loadA = teacherLoads.get(a.id) ?? { used: 0, limit: getTeacherLimit(a) };
            const loadB = teacherLoads.get(b.id) ?? { used: 0, limit: getTeacherLimit(b) };
            const remA = Number.isFinite(loadA.limit) ? loadA.limit - loadA.used : Infinity;
            const remB = Number.isFinite(loadB.limit) ? loadB.limit - loadB.used : Infinity;
            if (remA === remB) return (a.name || '').localeCompare(b.name || '');
            return remB - remA;
          });
        } else {
          teachersList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        }

        if (!teachersList.length) {
          const empty = document.createElement('div');
          empty.className = 'rounded-lg border border-dashed border-gray-200 bg-white/70 p-4 text-center text-sm text-gray-500';
          empty.textContent = query
            ? 'Keine Lehrkräfte passend zur Suche.'
            : 'Keine Lehrkräfte vorhanden.';
          listContainer.appendChild(empty);
          return;
        }

        teachersList.forEach((teacher, index) => {
          const teacherMap = assignmentsByTeacher.get(teacher.id);
          const load = teacherLoads.get(teacher.id) ?? { used: 0, limit: getTeacherLimit(teacher) };
          const remainingCapacity = Number.isFinite(load.limit) ? Math.max(0, load.limit - load.used) : Infinity;
          const isSelected = state.selectedTeacherId === teacher.id;
          const subjectLabels = teacherSubjectLabels(teacher.id);

          const card = document.createElement('article');
          card.dataset.teacherId = String(teacher.id);
          card.className = [
            'group rounded-lg border-2 p-3 transition-all cursor-pointer',
            isSelected ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md',
          ].join(' ');
          card.draggable = true;

          card.addEventListener('dragstart', () => {
            currentDragPayload = {
              kind: 'teacher',
              teacherId: teacher.id,
            };
          });

          card.addEventListener('dragend', () => {
            currentDragPayload = null;
          });

          const topRow = document.createElement('div');
          topRow.className = 'flex items-start justify-between gap-2';

          const left = document.createElement('div');
          left.className = 'flex items-center gap-3 min-w-0';

          const badge = createTeacherBadge(teacher, { size: 'md' });
          badge.classList.add('shadow-sm');
          const info = document.createElement('div');
          info.className = 'min-w-0';
          const nameEl = document.createElement('div');
          nameEl.className = 'font-medium text-sm text-gray-900 truncate';
          nameEl.textContent = teacher.name || teacher.kuerzel || `Lehrkraft #${teacher.id}`;
          const subjectsLine = document.createElement('div');
          subjectsLine.className = 'text-xs text-gray-500 truncate';
          subjectsLine.textContent = subjectLabels.length ? subjectLabels.join(', ') : 'Noch keine Zuweisung';
          info.append(nameEl, subjectsLine);

          left.append(badge, info);

          const right = document.createElement('div');
          right.className = 'flex items-center gap-2';
          const loadBadge = document.createElement('span');
          loadBadge.className = 'px-2 py-0.5 rounded-full bg-gray-100 text-xs font-semibold text-gray-700';
          loadBadge.textContent = Number.isFinite(load.limit)
            ? `${load.used}/${load.limit}h`
            : `${load.used}h`;
          right.appendChild(loadBadge);
          if (isSelected) {
            const mark = createIcon(ICONS.CHECK, { size: 16 });
            mark.classList.add('text-blue-600');
            right.appendChild(mark);
          }

          topRow.append(left, right);

          const progressWrap = document.createElement('div');
          progressWrap.className = 'space-y-1 mt-3';
          const progressInfo = document.createElement('div');
          progressInfo.className = 'flex items-center justify-between text-xs text-gray-600';
          progressInfo.innerHTML = `
            <span>Stunden</span>
            <span class="font-semibold text-gray-900">${Number.isFinite(load.limit) ? `${load.used} / ${load.limit}` : `${load.used}`}</span>
          `;
          const progressBar = document.createElement('div');
          progressBar.className = 'h-1.5 bg-gray-100 rounded-full overflow-hidden';
          const fill = document.createElement('div');
          const percent = Number.isFinite(load.limit) && load.limit > 0 ? Math.min(100, (load.used / load.limit) * 100) : 0;
          fill.className = `h-full rounded-full transition-all ${progressColorClass(percent)}`;
          fill.style.width = `${percent}%`;
          progressBar.appendChild(fill);
          progressWrap.append(progressInfo, progressBar);

          card.append(topRow, progressWrap);

          const highlight = () => {
            card.classList.add('border-blue-400', 'bg-blue-50');
            card.classList.remove('border-gray-200');
          };
          const unhighlight = () => {
            if (!isSelected) {
              card.classList.remove('border-blue-400', 'bg-blue-50');
              card.classList.add('border-gray-200', 'bg-white');
            }
          };

          card.addEventListener('dragenter', event => {
            const data = getDragData(event);
            if (!data) return;
            event.preventDefault();
            if (computeTeacherDropAcceptance(teacher.id, data)) {
              highlight();
            }
          });

          card.addEventListener('dragover', event => {
            const data = getDragData(event);
            if (!data) return;
            const acceptable = computeTeacherDropAcceptance(teacher.id, data);
            event.preventDefault();
            event.dataTransfer.dropEffect = acceptable
              ? data.kind === 'assignment'
                ? 'move'
                : 'copy'
              : 'none';
            if (acceptable) {
              highlight();
            } else {
              unhighlight();
            }
          });

          card.addEventListener('dragleave', () => {
            unhighlight();
          });

          card.addEventListener('drop', async event => {
            unhighlight();
            event.preventDefault();
            const data = getDragData(event);
            if (!data) return;
            if (!computeTeacherDropAcceptance(teacher.id, data)) return;
            if (data.kind === 'assignment') {
              await moveAssignmentBlock(data.teacherId, teacher.id, data.classId, data.subjectId);
            } else {
              const amount = data.count && data.count > 0 ? data.count : 1;
              await assignHour(teacher.id, data.classId, data.subjectId, amount);
            }
            currentDragPayload = null;
          });

          card.addEventListener('click', () => {
            state.selectedTeacherId = isSelected ? null : teacher.id;
            renderBoard();
          });

          if (teacherMap && teacherMap.size === 0 && remainingCapacity <= 0 && Number.isFinite(load.limit)) {
            const note = document.createElement('div');
            note.className = 'mt-2 text-xs text-orange-600';
            note.textContent = 'Deputat ausgeschöpft.';
            card.appendChild(note);
          }

          listContainer.appendChild(card);
        });
      }

      return panel;
    }

    function renderSubjectPanel() {
      const panel = document.createElement('section');
      panel.className = 'flex-1 bg-white border border-gray-200 rounded-xl flex flex-col shadow-sm';

      const header = document.createElement('div');
      header.className = 'flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4 bg-white';
      const headerLeft = document.createElement('div');
      headerLeft.className = 'space-y-1';
      const titleLine = document.createElement('div');
      titleLine.className = 'flex items-center gap-2 text-lg font-semibold text-gray-900';
      const bookIcon = createIcon(ICONS.BOOK_OPEN, { size: 20 });
      bookIcon.classList.add('text-blue-600');
      titleLine.append(bookIcon, document.createTextNode('Fächerverteilung'));
    const subtitle = document.createElement('p');
    subtitle.className = 'text-sm text-gray-600';
    const activeTeacher = state.teachers.find(t => t.id === state.selectedTeacherId);
    if (activeTeacher) {
      subtitle.textContent = `${activeTeacher.name || activeTeacher.kuerzel || 'Lehrkraft'} ist ausgewählt – klicke auf offene Stunden, um jeweils 1h zuzuweisen (Umschalttaste = alle offenen Stunden).`;
    } else {
      subtitle.textContent = 'Wähle links eine Lehrkraft aus und klicke auf offene Stunden.';
    }
      headerLeft.append(titleLine, subtitle);
      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:text-gray-900 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1';
      const viewIcon = createIcon(ICONS.SLIDERS_HORIZONTAL, { size: 16 });
      viewIcon.classList.add('text-current');
      viewBtn.append(viewIcon, document.createTextNode('Ansicht'));
      header.append(headerLeft, viewBtn);

      const content = document.createElement('div');
      content.className = 'flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50';

      const classes = stateClassesSorted();
      if (!classes.length) {
        const empty = document.createElement('div');
        empty.className = 'rounded-lg border border-dashed border-gray-200 bg-white/70 p-4 text-center text-sm text-gray-500';
        empty.textContent = 'Keine Klassen vorhanden.';
        content.appendChild(empty);
      } else {
        classes.forEach(cls => {
          const classEntry = document.createElement('article');
          classEntry.className = 'bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm';

          const isCollapsed = state.collapsedClasses.has(cls.id);
          const subjects = collectSubjectsForClass(cls.id);
          const totalHours = subjects.reduce((sum, item) => sum + (item.info.total || 0), 0);
          const remainingHours = subjects.reduce((sum, item) => sum + Math.max(0, item.info.remaining || 0), 0);

          const classHeader = document.createElement('div');
          classHeader.className = 'flex items-center justify-between gap-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors';
          classHeader.addEventListener('click', () => {
            toggleClassCollapsed(cls.id);
            renderBoard();
          });

          const left = document.createElement('div');
          left.className = 'flex items-center gap-3';
          const toggleButton = document.createElement('button');
          toggleButton.type = 'button';
          toggleButton.className = 'rounded-md border border-transparent p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500';
          const toggleIcon = createIcon(isCollapsed ? ICONS.CHEVRON_DOWN : ICONS.CHEVRON_UP, { size: 18 });
          toggleButton.appendChild(toggleIcon);
          toggleButton.addEventListener('click', event => {
            event.stopPropagation();
            toggleClassCollapsed(cls.id);
            renderBoard();
          });
          const titleWrap = document.createElement('div');
          titleWrap.innerHTML = `
            <div class="font-semibold text-sm text-gray-900">${formatClassLabel(cls)}</div>
            <div class="text-xs text-gray-500">${subjects.length} Fächer • ${totalHours} Stunden</div>
          `;
          left.append(toggleButton, titleWrap);

          const right = document.createElement('div');
          right.className = 'flex items-center gap-2 text-sm font-medium';
          if (remainingHours === 0) {
            const doneIcon = createIcon(ICONS.CHECK, { size: 16 });
            doneIcon.classList.add('text-green-600');
            const label = document.createElement('span');
            label.className = 'text-green-600';
            label.textContent = 'Vollständig';
            right.append(doneIcon, label);
          } else {
            const warnIcon = createIcon(ICONS.ALERT_CIRCLE, { size: 16 });
            warnIcon.classList.add('text-orange-500');
            const label = document.createElement('span');
            label.className = 'text-orange-600';
            label.textContent = `${remainingHours} h offen`;
            right.append(warnIcon, label);
          }

          classHeader.append(left, right);
          classEntry.appendChild(classHeader);

          if (!isCollapsed) {
            const grid = document.createElement('div');
            grid.className = 'p-3 pt-0 grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';

            subjects.forEach(({ key, info }) => {
              const subject = maps.subjects.get(info.subjectId);
              const assignedEntries = collectAssignmentsForClassSubject(info.classId, info.subjectId);
              const isComplete = (info.remaining || 0) <= 0;

              const card = document.createElement('div');
              const cardClasses = ['p-3', 'rounded-lg', 'border-2', 'transition-all', 'bg-white', 'flex', 'flex-col', 'gap-3'];
              if (isComplete) {
                cardClasses.push('border-green-200', 'bg-green-50', 'cursor-default');
              } else {
                cardClasses.push('border-gray-200', 'hover:border-blue-400', 'hover:shadow-md', 'cursor-pointer');
              }
              card.className = cardClasses.join(' ');

              const headerRow = document.createElement('div');
              headerRow.className = 'flex items-start justify-between gap-2';
              const subjectInfo = document.createElement('div');
              subjectInfo.className = 'flex-1 min-w-0';
              const subjectCode = document.createElement('div');
              subjectCode.className = 'font-semibold text-sm text-gray-900 truncate';
              subjectCode.textContent = subject?.kuerzel || formatSubjectLabel(subject) || 'Fach';
              const subjectName = document.createElement('div');
              subjectName.className = 'text-xs text-gray-500 truncate';
              subjectName.textContent = subject?.name || '';
              subjectInfo.append(subjectCode, subjectName);

              const headerActions = document.createElement('div');
              headerActions.className = 'flex items-center gap-1';

              const infoBtn = document.createElement('button');
              infoBtn.type = 'button';
              infoBtn.className = 'flex items-center justify-center p-1.5 rounded-md border border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500';
              infoBtn.title = 'Konfiguration anzeigen';
              const infoIcon = createIcon(ICONS.SLIDERS_HORIZONTAL, { size: 16 });
              infoIcon.classList.add('text-current');
              infoBtn.appendChild(infoIcon);
              infoBtn.addEventListener('click', event => {
                event.stopPropagation();
                const entry = {
                  classId: info.classId,
                  subjectId: info.subjectId,
                  records: assignedEntries.flatMap(item => item.entry.records),
                  doppelstunde: assignedEntries[0]?.entry.records[0]?.doppelstunde ?? null,
                  nachmittag: assignedEntries[0]?.entry.records[0]?.nachmittag ?? null,
                  participation: assignedEntries[0]?.entry.records[0]?.participation ?? null,
                };
                promptSubjectConfigNavigation(entry);
              });

              headerActions.append(infoBtn);

              headerRow.append(subjectInfo, headerActions);

              const stats = document.createElement('div');
              stats.className = 'mt-2 space-y-1 text-xs text-gray-600';
              const totalLine = document.createElement('div');
              totalLine.className = 'flex items-center justify-between';
              totalLine.innerHTML = `<span>Gesamt</span><span class="font-semibold text-gray-900">${info.total || 0}h</span>`;
              stats.append(totalLine);

              const remainingValue = Math.max(0, info.remaining || 0);
              if (remainingValue > 0) {
                const remainingLine = document.createElement('div');
                remainingLine.className = 'flex items-center justify-between text-orange-600';
                remainingLine.innerHTML = `<span>Offen</span><span class="font-semibold">${remainingValue}h</span>`;
                stats.append(remainingLine);
              } else {
                const assignedLine = document.createElement('div');
                assignedLine.className = 'flex items-center gap-1 text-green-600 font-medium';
                const assignedIcon = createIcon(ICONS.CHECK, { size: 14 });
                assignedLine.append(assignedIcon, document.createTextNode('Zugewiesen'));
                stats.append(assignedLine);
              }

              card.append(headerRow, stats);

              if (!isComplete) {
                card.addEventListener('click', async event => {
                  if (state.assignmentMode === 'range') {
                    setStatus('Bitte in den Fix-Modus wechseln, um Stunden zuzuweisen.', true);
                    setTimeout(clearStatus, 1500);
                    return;
                  }
                  if (!state.selectedTeacherId) {
                    setStatus('Bitte zuerst eine Lehrkraft auswählen.', true);
                    setTimeout(clearStatus, 1500);
                    return;
                  }
                  const remaining = Math.max(0, info.remaining || 0);
                  if (remaining <= 0) {
                    setStatus('Keine offenen Stunden mehr für dieses Fach.', true);
                    setTimeout(clearStatus, 1500);
                    return;
                  }
                  const amount = event.shiftKey ? remaining : 1;
                  await assignHour(state.selectedTeacherId, info.classId, info.subjectId, amount);
                });

                const highlight = () => {
                  card.classList.add('border-blue-400', 'bg-blue-50');
                };
                const unhighlight = () => {
                  card.classList.remove('border-blue-400', 'bg-blue-50');
                };

                card.addEventListener('dragenter', event => {
                  const data = getDragData(event);
                  if (!data || data.kind !== 'teacher') return;
                  event.preventDefault();
                  highlight();
                });

                card.addEventListener('dragover', event => {
                  const data = getDragData(event);
                  if (!data || data.kind !== 'teacher') return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'copy';
                });

                card.addEventListener('dragleave', () => {
                  unhighlight();
                });

                card.addEventListener('drop', async event => {
                  const data = getDragData(event);
                  unhighlight();
                  if (!data || data.kind !== 'teacher') return;
                  event.preventDefault();
                  const remaining = Math.max(0, info.remaining || 0);
                  if (remaining <= 0) {
                    setStatus('Keine offenen Stunden mehr für dieses Fach.', true);
                    setTimeout(clearStatus, 1500);
                    return;
                  }
                  await assignHour(data.teacherId, info.classId, info.subjectId, 1);
                });
              }

              if (assignedEntries.length) {
                const assignmentList = document.createElement('div');
                assignmentList.className = 'mt-3 border-t border-gray-200 pt-2 space-y-2';
                assignedEntries.forEach(({ teacher, entry }) => {
                  const row = document.createElement('div');
                  row.className = 'flex items-center justify-between gap-2 rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700';
                  row.draggable = true;
                  row.addEventListener('dragstart', event => {
                    currentDragPayload = {
                      kind: 'assignment',
                      teacherId: teacher.id,
                      classId: entry.classId,
                      subjectId: entry.subjectId,
                      count: entry.total,
                    };
                    event.dataTransfer.effectAllowed = 'move';
                    const payload = JSON.stringify(currentDragPayload);
                    event.dataTransfer.setData('application/json', payload);
                    event.dataTransfer.setData('text/plain', payload);
                  });
                  row.addEventListener('dragend', () => {
                    currentDragPayload = null;
                  });

                  const rowInfo = document.createElement('div');
                  rowInfo.className = 'flex items-center gap-2';
                  const badge = createTeacherBadge(teacher, { size: 'sm' });
                  badge.classList.add('shadow-sm');
                  rowInfo.appendChild(badge);

                  const removeBtn = document.createElement('button');
                  removeBtn.type = 'button';
                  removeBtn.className = 'inline-flex items-center justify-center w-6 h-6 rounded-md text-red-500 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1';
                  removeBtn.title = 'Zuweisung entfernen';
                  const removeIcon = createIcon(ICONS.X, { size: 14 });
                  removeBtn.appendChild(removeIcon);
                  removeBtn.addEventListener('click', async () => {
                    const confirmed = await confirmModal({
                      title: 'Zuweisung entfernen',
                      message: `Alle ${entry.total} Stunden entfernen?`,
                      confirmText: 'Entfernen',
                    });
                    if (!confirmed) return;
                    adjustAssignment(entry, teacher.id, -entry.total);
                  });
                  rowInfo.appendChild(removeBtn);

                  const hoursBadge = document.createElement('span');
                  hoursBadge.className = 'inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs';
                  hoursBadge.textContent = `${entry.total}h`;

                  row.append(rowInfo, hoursBadge);
                  assignmentList.appendChild(row);
                });
                card.appendChild(assignmentList);
              }

              grid.appendChild(card);
            });

            classEntry.appendChild(grid);
          }

          content.appendChild(classEntry);
        });
      }

      panel.append(header, content);
      return panel;
    }

    function renderTeacherDetailsPanel() {
      const teacher = state.teachers.find(t => t.id === state.selectedTeacherId);
      if (!teacher) return null;
      const assignments = assignmentsByTeacher.get(teacher.id);
      const load = teacherLoads.get(teacher.id) ?? { used: 0, limit: getTeacherLimit(teacher) };

      const panel = document.createElement('aside');
      panel.className = 'xl:w-80 w-full bg-white border border-gray-200 rounded-xl flex flex-col shadow-sm';

      const header = document.createElement('div');
      header.className = 'p-4 border-b border-gray-200 space-y-3 bg-white';
      const headerTop = document.createElement('div');
      headerTop.className = 'flex items-center justify-between gap-3';
      const identity = document.createElement('div');
      identity.className = 'flex items-center gap-2';
      const detailBadge = createTeacherBadge(teacher, { size: 'sm' });
      detailBadge.classList.add('shadow-sm');
      const identityText = document.createElement('div');
      identityText.className = 'space-y-1';
      const title = document.createElement('div');
      title.className = 'font-semibold text-sm text-gray-900';
      title.textContent = 'Details';
      const name = document.createElement('div');
      name.className = 'text-sm text-gray-500';
      name.textContent = teacher.name || teacher.kuerzel || `Lehrkraft #${teacher.id}`;
      identityText.append(title, name);
      identity.append(detailBadge, identityText);
      const deselectBtn = document.createElement('button');
      deselectBtn.type = 'button';
      deselectBtn.className = 'inline-flex items-center px-2.5 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-md hover:text-gray-900 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1';
      deselectBtn.textContent = 'Auswahl aufheben';
      deselectBtn.addEventListener('click', () => {
        state.selectedTeacherId = null;
        renderBoard();
      });
      headerTop.append(identity, deselectBtn);
      header.appendChild(headerTop);

      const body = document.createElement('div');
      body.className = 'flex-1 overflow-y-auto p-4 space-y-4 bg-white';

      const loadCard = document.createElement('div');
      loadCard.className = 'rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 space-y-1';
      loadCard.innerHTML = `
        <div class="font-semibold text-gray-900">Kapazität</div>
        <div>${Number.isFinite(load.limit) ? `${load.used} von ${load.limit} Stunden` : `${load.used} Stunden (offene Kapazität)`}</div>
      `;
      body.appendChild(loadCard);

      const subjects = teacherSubjectLabels(teacher.id);
      if (subjects.length) {
        const chipCard = document.createElement('div');
        chipCard.className = 'rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700 space-y-2';
        const chipTitle = document.createElement('div');
        chipTitle.className = 'font-semibold';
        chipTitle.textContent = 'Zugewiesene Fächer';
        chipCard.appendChild(chipTitle);
        const chipWrap = document.createElement('div');
        chipWrap.className = 'flex flex-wrap gap-1';
        subjects.forEach(label => {
          const chip = document.createElement('span');
          chip.className = 'inline-flex items-center px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold';
          chip.textContent = label;
          chipWrap.appendChild(chip);
        });
        chipCard.appendChild(chipWrap);
        body.appendChild(chipCard);
      }

      const assignmentCard = document.createElement('div');
      assignmentCard.className = 'rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-700 space-y-2 shadow-sm';
      const assignmentTitle = document.createElement('div');
      assignmentTitle.className = 'font-semibold text-gray-900';
      assignmentTitle.textContent = 'Zugewiesene Stunden';
      assignmentCard.appendChild(assignmentTitle);

      if (!assignments || !assignments.size) {
        const empty = document.createElement('div');
        empty.className = 'text-gray-500';
        empty.textContent = 'Noch keine Zuweisungen in dieser Version.';
        assignmentCard.appendChild(empty);
      } else {
        const list = document.createElement('div');
        list.className = 'space-y-2';
        const entries = Array.from(assignments.values()).sort((a, b) => {
          const classA = maps.classes.get(a.classId)?.name || '';
          const classB = maps.classes.get(b.classId)?.name || '';
          if (classA === classB) {
            const subjA = maps.subjects.get(a.subjectId)?.name || '';
            const subjB = maps.subjects.get(b.subjectId)?.name || '';
            return subjA.localeCompare(subjB);
          }
          return classA.localeCompare(classB);
        });
        entries.forEach(entry => {
          const row = document.createElement('div');
          row.className = 'flex items-start justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700';
          const info = document.createElement('div');
          info.className = 'flex flex-col';
          const classLabel = maps.classes.get(entry.classId);
          const subjectLabel = maps.subjects.get(entry.subjectId);
          const top = document.createElement('span');
          top.className = 'font-medium text-gray-900';
          top.textContent = `${formatSubjectLabel(subjectLabel)} (${formatClassLabel(classLabel)})`;
          info.appendChild(top);
          const hours = document.createElement('span');
          hours.className = 'inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold';
          hours.textContent = `${entry.total}h`;
          row.append(info, hours);
          list.appendChild(row);
        });
        assignmentCard.appendChild(list);
      }

      body.appendChild(assignmentCard);

      panel.append(header, body);
      return panel;
    }

    function computeTeacherDropAcceptance(targetTeacherId, payload) {
      if (!payload) return false;
      if (payload.kind === 'assignment') {
        if (payload.teacherId === targetTeacherId) return false;
        return canAcceptAssignmentMove(targetTeacherId, payload, teacherLoads);
      }
      const amount = payload.count && payload.count > 0 ? payload.count : 1;
      const key = `${payload.classId}|${payload.subjectId}`;
      const info = remainingMap.get(key);
      if (!info || info.remaining == null || info.remaining < amount) return false;
      const isOptional = (info.participation || 'curriculum') === 'ag';
      return canAssignHour(targetTeacherId, payload.classId, payload.subjectId, remainingMap, teacherLoads, amount, {
        isOptional,
      });
    }

    function collectSubjectsForClass(classId) {
      const subjects = [];
      remainingMap.forEach((info, key) => {
        if (info.classId === classId) {
          subjects.push({ key, info });
        }
      });
      subjects.sort((a, b) => {
        const subjA = maps.subjects.get(a.info.subjectId);
        const subjB = maps.subjects.get(b.info.subjectId);
        return (subjA?.name || '').localeCompare(subjB?.name || '');
      });
      return subjects;
    }

    function collectAssignmentsForClassSubject(classId, subjectId) {
      const key = `${classId}|${subjectId}`;
      const entries = classSubjectAssignments.get(key) || [];
      return entries
        .map(({ teacherId, entry }) => {
          const teacher = maps.teachers.get(teacherId);
          if (!teacher) return null;
          return { teacher, entry };
        })
        .filter(Boolean);
    }

    function toggleClassCollapsed(classId) {
      if (state.collapsedClasses.has(classId)) {
        state.collapsedClasses.delete(classId);
      } else {
        state.collapsedClasses.add(classId);
      }
    }

    function teacherSubjectLabels(teacherId) {
      const assignments = assignmentsByTeacher.get(teacherId);
      if (!assignments) return [];
      const labels = new Set();
      assignments.forEach(entry => {
        const subject = maps.subjects.get(entry.subjectId);
        if (subject) {
          labels.add(subject.kuerzel || subject.name);
        }
      });
      return Array.from(labels).sort((a, b) => a.localeCompare(b));
    }

    function canAcceptAssignmentMove(targetTeacherId, payload, loads) {
      if (!payload || payload.kind !== 'assignment') return false;
      if (payload.teacherId === targetTeacherId) return false;
      const sourceRecords = state.requirements.filter(req =>
        req.version_id === state.selectedVersionId &&
        req.teacher_id === payload.teacherId &&
        req.class_id === payload.classId &&
        req.subject_id === payload.subjectId
      );
      if (!sourceRecords.length) return false;
      const load = loads.get(targetTeacherId);
      if (!load) return true;
      if (!Number.isFinite(load.limit)) return true;
      const totalMove = typeof payload.count === 'number' && payload.count > 0
        ? payload.count
        : sourceRecords.reduce((sum, rec) => sum + (rec.wochenstunden || 0), 0);
      return load.used + totalMove <= load.limit;
    }
  }

  function canAssignHour(teacherId, classId, subjectId, remainingMap, teacherLoads, amount = 1, options = {}) {
    const key = `${classId}|${subjectId}`;
    const info = remainingMap.get(key);
    if (!info || info.remaining == null || info.remaining < amount) return false;
    const load = teacherLoads.get(teacherId);
    const isOptional = options.isOptional || (info?.participation || 'curriculum') === 'ag';
    if (!load) return true;
    if (!Number.isFinite(load.limit)) return true;
    if (isOptional) return true;
    return load.used + amount <= load.limit;
  }

  async function assignHour(teacherId, classId, subjectId, amount = 1) {
    setStatus('Speichere Zuweisung…');
    try {
      const existing = findRequirement(teacherId, classId, subjectId);
      if (existing) {
          const payload = {
            class_id: existing.class_id,
            subject_id: existing.subject_id,
            teacher_id: existing.teacher_id,
            version_id: existing.version_id,
            wochenstunden: (existing.wochenstunden || 0) + amount,
            doppelstunde: existing.doppelstunde ?? null,
            nachmittag: existing.nachmittag ?? null,
            participation: existing.participation ?? 'curriculum',
          };
        const updated = await updateRequirement(existing.id, payload);
          Object.assign(existing, updated);
        } else {
        const subject = maps.subjects.get(subjectId);
        const curriculumEntry = state.curriculum.find(entry => entry.class_id === classId && entry.subject_id === subjectId);
        const participationDefault = curriculumEntry?.participation || (subject?.is_ag_foerder ? 'ag' : 'curriculum');
        const doppelDefault = curriculumEntry?.doppelstunde ?? subject?.default_doppelstunde ?? null;
        const nachmittagDefault = curriculumEntry?.nachmittag ?? subject?.default_nachmittag ?? null;
        const created = await createRequirement({
          class_id: classId,
          subject_id: subjectId,
          teacher_id: teacherId,
          version_id: state.selectedVersionId,
          wochenstunden: amount,
          doppelstunde: doppelDefault,
          nachmittag: nachmittagDefault,
          participation: participationDefault,
          config_source: 'subject',
        });
        state.requirements.push(created);
      }
      setStatus('Gespeichert.');
      setTimeout(clearStatus, 1500);
      renderBoard();
      return true;
    } catch (err) {
      setStatus(`Fehler: ${formatError(err)}`, true);
      return false;
    }
  }

  async function moveAssignmentBlock(fromTeacherId, toTeacherId, classId, subjectId) {
    if (fromTeacherId === toTeacherId) return false;
    setStatus('Verschiebe Stunden…');
    const records = state.requirements.filter(req =>
      req.version_id === state.selectedVersionId &&
      req.teacher_id === fromTeacherId &&
      req.class_id === classId &&
      req.subject_id === subjectId
    );
    if (!records.length) {
      setStatus('Keine Stunden zum Verschieben gefunden.', true);
      setTimeout(clearStatus, 1500);
      return false;
    }

    const createdRecords = [];
    const removedSnapshots = [];

    try {
      for (const rec of records) {
        removedSnapshots.push({ original: { ...rec } });
        await deleteRequirement(rec.id);
        state.requirements = state.requirements.filter(r => r.id !== rec.id);

        const created = await createRequirement({
          class_id: rec.class_id,
          subject_id: rec.subject_id,
          teacher_id: toTeacherId,
          version_id: rec.version_id,
          wochenstunden: rec.wochenstunden,
          doppelstunde: rec.doppelstunde ?? null,
          nachmittag: rec.nachmittag ?? null,
          participation: rec.participation ?? 'curriculum',
        });
        state.requirements.push(created);
        createdRecords.push(created);
      }

      setStatus('Stunden verschoben.', false);
      setTimeout(clearStatus, 1500);
      renderBoard();
      return true;
    } catch (err) {
      for (const created of createdRecords) {
        try {
          await deleteRequirement(created.id);
        } catch {
          /* ignore */
        }
        state.requirements = state.requirements.filter(r => r.id !== created.id);
      }

      for (const snapshot of removedSnapshots) {
        try {
          const restored = await createRequirement(snapshot.original);
          state.requirements.push(restored);
        } catch {
          /* ignore */
        }
      }

      setStatus(`Fehler: ${formatError(err)}`, true);
      setTimeout(clearStatus, 1500);
      renderBoard();
      return false;
    }
  }

  async function adjustAssignment(entry, teacherId, delta) {
    if (delta === 0) return;
    const step = delta > 0 ? 1 : -1;
    let remainingDelta = delta;
    setStatus('Aktualisiere Zuweisung…');
    try {
      while (remainingDelta !== 0 && entry.records.length) {
        const target = entry.records[entry.records.length - 1];
        const currentHours = target.wochenstunden || 0;
        if (delta < 0) {
          const reduction = Math.min(currentHours, Math.abs(step));
          const newValue = currentHours - reduction;
          if (newValue <= 0) {
            await deleteRequirement(target.id);
            state.requirements = state.requirements.filter(r => r.id !== target.id);
            entry.records.pop();
          } else {
            const payload = {
              class_id: target.class_id,
              subject_id: target.subject_id,
              teacher_id: target.teacher_id,
              version_id: target.version_id,
              wochenstunden: newValue,
              doppelstunde: target.doppelstunde ?? null,
              nachmittag: target.nachmittag ?? null,
            };
            const updated = await updateRequirement(target.id, payload);
            Object.assign(target, updated);
          }
          remainingDelta += 1;
        } else {
          const payload = {
            class_id: target.class_id,
            subject_id: target.subject_id,
            teacher_id: target.teacher_id,
            version_id: target.version_id,
            wochenstunden: currentHours + 1,
            doppelstunde: target.doppelstunde ?? null,
            nachmittag: target.nachmittag ?? null,
          };
          const updated = await updateRequirement(target.id, payload);
          Object.assign(target, updated);
          remainingDelta -= 1;
        }
      }

      if (remainingDelta > 0) {
        const last = entry.records[entry.records.length - 1];
        for (let i = 0; i < remainingDelta; i += 1) {
          const success = await assignHour(teacherId, entry.classId, entry.subjectId);
          if (!success) break;
        }
        if (last) remainingDelta = 0;
      }

      setStatus('Gespeichert.');
      setTimeout(clearStatus, 1500);
      renderBoard();
    } catch (err) {
      setStatus(`Fehler: ${formatError(err)}`, true);
    }
  }

  function findRequirement(teacherId, classId, subjectId) {
    return state.requirements.find(req =>
      req.teacher_id === teacherId &&
      req.class_id === classId &&
      req.subject_id === subjectId &&
      req.version_id === state.selectedVersionId
    );
  }

  function computeRemainingMap() {
    const remaining = new Map();
    state.curriculum.forEach(entry => {
      const key = `${entry.class_id}|${entry.subject_id}`;
      remaining.set(key, {
        classId: entry.class_id,
        subjectId: entry.subject_id,
        total: entry.wochenstunden || 0,
        remaining: entry.wochenstunden || 0,
        participation: entry.participation || 'curriculum',
      });
    });

    state.requirements
      .filter(req => req.version_id === state.selectedVersionId)
      .forEach(req => {
        const key = `${req.class_id}|${req.subject_id}`;
        const info = remaining.get(key);
        if (!info) {
          remaining.set(key, {
            classId: req.class_id,
            subjectId: req.subject_id,
            total: 0,
            remaining: -(req.wochenstunden || 0),
            participation: req.participation || 'curriculum',
          });
        } else {
          info.remaining = Math.max(0, (info.remaining || 0) - (req.wochenstunden || 0));
        }
      });

    return remaining;
  }

  function groupAssignmentsByTeacher() {
    const result = new Map();
    state.requirements
      .filter(req => req.version_id === state.selectedVersionId)
      .forEach(req => {
        const teacherMap = result.get(req.teacher_id) ?? new Map();
        const key = `${req.class_id}|${req.subject_id}`;
        let entry = teacherMap.get(key);
        if (!entry) {
          entry = {
            classId: req.class_id,
            subjectId: req.subject_id,
            total: 0,
            mandatory: 0,
            optional: 0,
            records: [],
          };
          teacherMap.set(key, entry);
        }
        const hours = req.wochenstunden || 0;
        entry.total += hours;
        if ((req.participation || 'curriculum') === 'ag') {
          entry.optional += hours;
        } else {
          entry.mandatory += hours;
        }
        entry.records.push(req);
        result.set(req.teacher_id, teacherMap);
      });
    return result;
  }

  function groupAssignmentsByClassSubject(assignmentsByTeacher) {
    const result = new Map();
    assignmentsByTeacher.forEach((teacherMap, teacherId) => {
      teacherMap.forEach(entry => {
        const key = `${entry.classId}|${entry.subjectId}`;
        const list = result.get(key) ?? [];
        list.push({ teacherId, entry });
        result.set(key, list);
      });
    });
    return result;
  }

  function computeTeacherLoads(assignments) {
    const loads = new Map();
    state.teachers.forEach(teacher => {
      const limit = getTeacherLimit(teacher);
      const teacherAssignments = assignments.get(teacher.id);
      const used = teacherAssignments
        ? Array.from(teacherAssignments.values()).reduce((sum, entry) => sum + (entry.mandatory || 0), 0)
        : 0;
      loads.set(teacher.id, { used, limit });
    });
    return loads;
  }

  function getTeacherLimit(teacher) {
    if (typeof teacher.deputat === 'number' && teacher.deputat > 0) return teacher.deputat;
    if (typeof teacher.deputat_soll === 'number' && teacher.deputat_soll > 0) return teacher.deputat_soll;
    return Infinity;
  }

  function progressColorClass(percentage) {
    if (!Number.isFinite(percentage)) return 'bg-green-500';
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-orange-500';
    return 'bg-green-500';
  }

  function getDragData(event) {
    try {
      const raw = event.dataTransfer.getData('application/json');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.classId === 'number' && typeof parsed.subjectId === 'number') {
          return {
            kind: parsed.kind || 'palette',
            classId: parsed.classId,
            subjectId: parsed.subjectId,
            teacherId: parsed.teacherId ?? null,
            count: parsed.count ?? null,
          };
        }
      }
    } catch {
      // ignore parse errors and fallback
    }
    if (currentDragPayload && typeof currentDragPayload.classId === 'number' && typeof currentDragPayload.subjectId === 'number') {
      return currentDragPayload;
    }
    return null;
  }

  function formatSubjectLabel(subject) {
    if (!subject) return 'Fach';
    const name = subject.name || '';
    const short = subject.kuerzel || '';
    if (short && name && short !== name) return `${short} (${name})`;
    return short || name || 'Fach';
  }

  function formatClassLabel(cls) {
    if (!cls) return 'Klasse';
    if (cls.name) return cls.name;
    if (cls.grade && cls.section) return `${cls.grade}${cls.section}`;
    return `Klasse #${cls.id ?? '?'}`;
  }

  function requirementMetaSummary(entry) {
    const rec = entry?.records?.[0];
    if (!rec) return '';

    const parts = [];

    const dsValue = rec.doppelstunde || 'kann';
    if (dsValue !== 'kann') {
      const label = labelForOption(DOPPEL_OPTIONS, dsValue);
      if (label) parts.push(label);
    }

    const nmValue = rec.nachmittag || 'kann';
    if (nmValue !== 'kann') {
      const label = labelForOption(NACHMITTAG_OPTIONS, nmValue);
      if (label) parts.push(label);
    }

    const subject = maps.subjects.get(entry.subjectId);
    if (subject?.required_room_id) {
      const room = state.rooms.find(r => r.id === subject.required_room_id);
      if (room?.name) {
        parts.push(`Raum ${room.name}`);
      }
    }

    const participation = rec.participation || 'curriculum';
    if (participation === 'ag') {
      const label = labelForOption(PARTICIPATION_OPTIONS, participation);
      if (label) {
        if (entry.optional && entry.optional > 0) {
          parts.push(`${label} (${entry.optional}h)`);
        } else {
          parts.push(label);
        }
      }
    }

    return parts.join(' · ');
  }

  async function promptSubjectConfigNavigation(entry) {
    const subject = maps.subjects.get(entry.subjectId);
    const cls = maps.classes.get(entry.classId);
    const message = [
      subject ? `Fach: ${formatSubjectLabel(subject)}` : null,
      cls ? `Klasse: ${formatClassLabel(cls)}` : null,
      'Doppelstunden, Nachmittagsregeln und Teilnahme pflegst du zentral unter Datenpflege > Fächer.',
    ].filter(Boolean).join('\n');

    const confirmed = await confirmModal({
      title: 'Fach-Konfiguration',
      message,
      confirmText: 'Datenpflege öffnen',
      cancelText: 'Schließen',
      confirmButtonClass: 'inline-flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
      cancelButtonClass: 'inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:text-gray-900 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
    });
    if (confirmed) {
      try {
        localStorage.setItem('maintenance-active-tab', 'subjects');
      } catch {
        // ignore storage issues
      }
      window.location.hash = '#/datenpflege';
    }
  }

function stateClassesSorted() {
  return state.classes
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

  initialize();
  return container;
}

function createStatusBar() {
  const element = document.createElement('div');
  element.className = 'text-sm text-gray-500 min-h-[1.5rem]';
  return {
    element,
    set(message, error = false) {
      element.textContent = message || '';
      element.className = `text-sm ${error ? 'text-red-600' : 'text-green-600'} min-h-[1.5rem]`;
    },
    clear() {
      element.textContent = '';
      element.className = 'text-sm text-gray-500 min-h-[1.5rem]';
    },
  };
}

function formatDate(value) {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
