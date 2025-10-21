import { fetchTeachers } from '../api/teachers.js';
import { fetchClasses } from '../api/classes.js';
import { fetchSubjects } from '../api/subjects.js';
import { fetchCurriculum } from '../api/curriculum.js';
import { fetchRooms } from '../api/rooms.js';
import { fetchVersions, createVersion, updateVersion, deleteVersion } from '../api/versions.js';
import { fetchRequirements, createRequirement, updateRequirement, deleteRequirement } from '../api/requirements.js';
import { confirmModal, formModal, formatError } from '../utils/ui.js';

export function createDistributionView() {
  const container = document.createElement('section');
  container.className = 'space-y-6';

  container.innerHTML = `
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold">Stundenverteilung</h1>
      <p class="text-sm opacity-70">Verteile die Wochenstunden auf Lehrkräfte und verwalte verschiedene Varianten.</p>
    </div>
  `;

  const toolbar = document.createElement('div');
  toolbar.className = 'flex flex-wrap items-center gap-3';

  const createBtn = document.createElement('button');
  createBtn.className = 'btn btn-primary';
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
    teachers: [],
    classes: [],
    subjects: [],
    curriculum: [],
    requirements: [],
    loading: false,
    collapsedTeachers: new Set(),
    teacherSort: 'name',
    showOnlyWithCapacity: false,
    rooms: [],
  };

  const maps = {
    classes: new Map(),
    subjects: new Map(),
    teachers: new Map(),
  };

const DOPPEL_OPTIONS = [
  { value: 'muss', label: 'Muss Doppelstunde' },
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
      state.collapsedTeachers = new Set(
        [...state.collapsedTeachers].filter(id => teachers.some(t => t.id === id))
      );

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
    wrap.className = 'card bg-base-100 shadow';
    wrap.innerHTML = `
      <div class="card-body items-center text-center space-y-3">
        <h2 class="card-title">Noch keine Stundenverteilung vorhanden</h2>
        <p class="text-sm opacity-70">Lege eine neue Version an, um mit der Verteilung zu starten.</p>
      </div>
    `;
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
    heading.innerHTML = '<h2 class="text-lg font-semibold">Versionen</h2>';
    versionsSection.appendChild(heading);

    if (!state.versions.length) {
      const empty = document.createElement('p');
      empty.className = 'text-sm opacity-70';
      empty.textContent = 'Noch keine Versionen vorhanden.';
      versionsSection.appendChild(empty);
      return;
    }

    const list = document.createElement('div');
    list.className = 'grid gap-3 md:grid-cols-2 xl:grid-cols-3';

    state.versions.forEach(version => {
      const card = document.createElement('article');
      const active = version.id === state.selectedVersionId;
      card.className = `card bg-base-100 border shadow-sm transition hover:shadow-md ${active ? 'border-primary' : 'border-base-200'}`;

      const body = document.createElement('div');
      body.className = 'card-body space-y-3';

      const titleRow = document.createElement('div');
      titleRow.className = 'flex items-start justify-between gap-3';

      const titleBlock = document.createElement('div');
      titleBlock.innerHTML = `
        <h3 class="card-title">${version.name}</h3>
        ${version.comment ? `<p class="text-sm opacity-70">${version.comment}</p>` : ''}
      `;

      const actionWrap = document.createElement('div');
      actionWrap.className = 'flex items-center gap-2';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-ghost btn-xs';
      editBtn.textContent = 'Bearbeiten';

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-ghost btn-xs text-error';
      deleteBtn.textContent = 'Löschen';

      actionWrap.append(editBtn, deleteBtn);
      titleRow.append(titleBlock, actionWrap);

      const meta = document.createElement('div');
      meta.className = 'flex items-center justify-between text-xs opacity-70';
      const versionIdLabel = document.createElement('span');
      versionIdLabel.textContent = `#${version.id}`;
      const dateLabel = document.createElement('span');
      dateLabel.textContent = formatDate(version.updated_at || version.created_at);
      meta.append(versionIdLabel, dateLabel);

      const selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      selectBtn.className = `btn btn-sm ${active ? 'btn-primary' : 'btn-outline'}`;
      selectBtn.textContent = active ? 'Aktiv' : 'Auswählen';

      body.append(titleRow, meta, selectBtn);
      card.appendChild(body);
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

    versionsSection.appendChild(list);
  }

  function renderBoard() {
    boardSection.innerHTML = '';

    if (!state.selectedVersionId) {
      boardSection.appendChild(createEmptyState());
      return;
    }

    const remainingMap = computeRemainingMap();
    const remainingCache = new Map();
    remainingMap.forEach((value, key) => {
      remainingCache.set(key, { ...value });
    });
    const assignments = groupAssignmentsByTeacher();
    const teacherLoads = computeTeacherLoads(assignments);

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

    const board = document.createElement('div');
    board.className = 'grid gap-6 lg:grid-cols-[minmax(260px,320px)_1fr]';

    const palette = document.createElement('div');
    palette.className = 'space-y-4';

    const paletteHeader = document.createElement('div');
    paletteHeader.className = 'flex items-center justify-between gap-3';

    const paletteTitle = document.createElement('h3');
    paletteTitle.className = 'text-lg font-semibold';
    paletteTitle.textContent = 'Fächer-Palette';

    const totalIndicator = document.createElement('span');
    totalIndicator.className = 'badge badge-outline';
    totalIndicator.textContent = `${countRemainingHours(remainingMap)} Stunden offen`;

    const paletteScroller = document.createElement('div');
    paletteScroller.className = 'overflow-x-auto pb-2';
    const paletteRow = document.createElement('div');
    paletteRow.className = 'flex gap-4 min-w-fit';

    paletteHeader.append(paletteTitle, totalIndicator);
    palette.append(paletteHeader, paletteScroller);
    paletteScroller.appendChild(paletteRow);

    const paletteBadges = new Map();
    const classCards = new Map();

    const groupedRemaining = new Map();
    remainingMap.forEach(info => {
      if (!info || !info.remaining || info.remaining <= 0) return;
      const classId = info.classId;
      const list = groupedRemaining.get(classId) ?? [];
      list.push(info);
      groupedRemaining.set(classId, list);
    });

    const classesToShow = computePaletteClassOrder(groupedRemaining);

    const showPaletteEmpty = () => {
      paletteRow.innerHTML = '';
      const empty = document.createElement('div');
      empty.dataset.paletteEmpty = 'true';
      empty.className = 'alert alert-success text-sm min-w-[260px]';
      empty.textContent = 'Alle Stunden sind verteilt.';
      paletteRow.appendChild(empty);
    };

    const clearPaletteEmpty = () => {
      const empty = paletteRow.querySelector('[data-palette-empty]');
      if (empty) empty.remove();
    };

    if (!classesToShow.length) {
      showPaletteEmpty();
    } else {
      clearPaletteEmpty();
    }

    classesToShow.forEach(cls => {
      const remainingList = groupedRemaining.get(cls.id) || [];
      if (!remainingList.length) return;

      remainingList.sort((a, b) => {
        const subA = maps.subjects.get(a.subjectId);
        const subB = maps.subjects.get(b.subjectId);
        return (subA?.name || '').localeCompare(subB?.name || '');
      });

      const classMeta = maps.classes.get(cls.id) || { id: cls.id };
      const card = document.createElement('article');
      card.className = 'card bg-base-100 border border-base-200 shadow-sm min-w-[280px]';

      const body = document.createElement('div');
      body.className = 'card-body space-y-4';

      const header = document.createElement('div');
      header.className = 'flex items-center justify-between gap-2';
      const title = document.createElement('h4');
      title.className = 'font-semibold text-sm';
      title.textContent = formatClassLabel(classMeta);
      const count = remainingList.reduce((sum, info) => sum + (info.remaining || 0), 0);
      const badge = document.createElement('span');
      badge.className = 'badge badge-outline badge-sm';
      badge.textContent = `${count} h offen`;
      header.append(title, badge);

      const pillWrap = document.createElement('div');
      pillWrap.className = 'flex flex-wrap gap-2';
      const classEntry = { card, badge, pillWrap, remaining: count };
      classCards.set(cls.id, classEntry);

      remainingList.forEach(info => {
        const subject = maps.subjects.get(info.subjectId);

        const pill = document.createElement('span');
        pill.className = 'inline-flex items-center gap-3 rounded-lg border bg-base-100 px-3 py-2 cursor-grab active:cursor-grabbing shadow-sm max-w-full';
        if (subject?.color) pill.style.borderColor = subject.color;
        pill.draggable = true;
        pill.dataset.key = `${info.classId}|${info.subjectId}`;

        const labelWrap = document.createElement('div');
        labelWrap.className = 'flex flex-col leading-tight text-left';
        const subjectRow = document.createElement('span');
        subjectRow.className = 'flex items-center gap-2';
        const subjectLabel = document.createElement('span');
        subjectLabel.className = 'font-semibold text-xs';
        subjectLabel.textContent = formatSubjectLabel(subject);
        const countBadge = document.createElement('span');
        countBadge.className = 'badge badge-sm badge-primary';
        countBadge.textContent = String(info.remaining);
        subjectRow.append(subjectLabel, countBadge);
        const classLabel = document.createElement('span');
        classLabel.className = 'text-[11px] opacity-70';
        classLabel.textContent = formatClassLabel(classMeta);
        labelWrap.append(subjectRow, classLabel);

        pill.append(labelWrap);

        pill.addEventListener('dragstart', event => {
          currentDragPayload = {
            kind: 'palette',
            classId: info.classId,
            subjectId: info.subjectId,
            count: info.remaining || 1,
          };
          event.dataTransfer.effectAllowed = 'copy';
          const payload = JSON.stringify(currentDragPayload);
          event.dataTransfer.setData('application/json', payload);
          event.dataTransfer.setData('text/plain', payload);
        });

        pill.addEventListener('dragend', () => {
          currentDragPayload = null;
        });

        pillWrap.appendChild(pill);
        paletteBadges.set(`${info.classId}|${info.subjectId}`, {
          badge: countBadge,
          pill,
          classId: cls.id,
        });
      });

      body.append(header, pillWrap);
      card.appendChild(body);
      paletteRow.appendChild(card);
    });

    if (!classesToShow.length) {
      showPaletteEmpty();
    }

    palette.appendChild(paletteScroller);
    if (!classesToShow.length) {
      const empty = document.createElement('div');
      empty.className = 'alert alert-success text-sm';
      empty.textContent = 'Alle Stunden sind verteilt.';
      paletteRow.appendChild(empty);
    }

    board.appendChild(palette);
    const teacherColumn = document.createElement('div');
    teacherColumn.className = 'space-y-4';

    const controls = document.createElement('div');
    controls.className = 'flex flex-wrap items-center justify-between gap-2';

    const primaryControls = document.createElement('div');
    primaryControls.className = 'flex items-center gap-2';

    const sortBtn = document.createElement('button');
    sortBtn.type = 'button';
    sortBtn.className = 'btn btn-xs btn-outline';
    sortBtn.textContent = state.teacherSort === 'name' ? 'Sortierung: A–Z' : 'Sortierung: Reststunden';
    sortBtn.addEventListener('click', () => {
      state.teacherSort = state.teacherSort === 'name' ? 'remaining' : 'name';
      renderBoard();
    });

    const filterBtn = document.createElement('button');
    filterBtn.type = 'button';
    filterBtn.className = `btn btn-xs ${state.showOnlyWithCapacity ? 'btn-primary' : 'btn-outline'}`;
    filterBtn.textContent = 'Nur freie';
    filterBtn.addEventListener('click', () => {
      state.showOnlyWithCapacity = !state.showOnlyWithCapacity;
      renderBoard();
    });

    primaryControls.append(sortBtn, filterBtn);

    const collapseAllBtn = document.createElement('button');
    collapseAllBtn.type = 'button';
    collapseAllBtn.className = 'btn btn-xs btn-ghost';

    controls.append(primaryControls, collapseAllBtn);
    teacherColumn.appendChild(controls);

    let teachersList = state.teachers.slice();
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

    const allVisibleCollapsed = teachersList.length > 0 && teachersList.every(t => isTeacherCollapsed(t.id));
    collapseAllBtn.textContent = allVisibleCollapsed ? 'Alle aufklappen' : 'Alle minimieren';
    collapseAllBtn.disabled = teachersList.length === 0;
    collapseAllBtn.addEventListener('click', () => {
      teachersList.forEach(t => setTeacherCollapsed(t.id, !allVisibleCollapsed));
      renderBoard();
    });

    if (!teachersList.length) {
      const empty = document.createElement('div');
      empty.className = 'alert alert-info text-sm';
      empty.textContent = state.showOnlyWithCapacity
        ? 'Alle Lehrkräfte sind bereits voll eingeplant.'
        : 'Keine Lehrkräfte vorhanden.';
      teacherColumn.appendChild(empty);
    } else {
      const teacherScroller = document.createElement('div');
      teacherScroller.className = 'overflow-x-auto';
      const teachersWrap = document.createElement('div');
      teachersWrap.className = 'flex gap-4 min-w-fit';

      teachersList.forEach(teacher => {
        const load = teacherLoads.get(teacher.id) ?? { used: 0, limit: getTeacherLimit(teacher) };
        const remainingCapacity = Number.isFinite(load.limit) ? Math.max(0, load.limit - load.used) : Infinity;
        const collapsed = isTeacherCollapsed(teacher.id);
        const teacherAssignments = assignments.get(teacher.id);
        const assignedSubjects = teacherAssignments ? teacherAssignments.size : 0;

        const teacherCard = document.createElement('article');
        teacherCard.className = 'card bg-base-100 border border-base-200 shadow-sm transition min-w-[320px]';
        teacherCard.dataset.teacherId = String(teacher.id);
        if (remainingCapacity <= 0 && Number.isFinite(load.limit)) {
          teacherCard.classList.add('opacity-80');
        }

        const body = document.createElement('div');
        body.className = 'card-body space-y-3';

        const header = document.createElement('div');
        header.className = 'flex items-start justify-between gap-3';

        const headerLeft = document.createElement('div');
        headerLeft.className = 'flex flex-col gap-1';
        const nameEl = document.createElement('h3');
        nameEl.className = 'card-title text-base';
        nameEl.textContent = teacher.name || teacher.kuerzel || `#${teacher.id}`;
        headerLeft.appendChild(nameEl);

        if (teacher.kuerzel) {
          const code = document.createElement('span');
          code.className = 'text-xs opacity-60';
          code.textContent = `Kürzel: ${teacher.kuerzel}`;
          headerLeft.appendChild(code);
        }

        const summary = document.createElement('span');
        summary.className = 'text-xs opacity-70';
        const subjectSummary = `${assignedSubjects} Fach${assignedSubjects === 1 ? '' : 'e'}`;
        summary.textContent = [
          `${load.used}h geplant`,
          Number.isFinite(load.limit) ? `${remainingCapacity}h frei` : 'Kapazität offen',
          subjectSummary,
        ].join(' · ');
        headerLeft.appendChild(summary);

        const headerRight = document.createElement('div');
        headerRight.className = 'flex items-center gap-2';

        const loadBadge = document.createElement('span');
        loadBadge.className = 'badge badge-outline';
        loadBadge.textContent = Number.isFinite(load.limit)
          ? `${load.used}/${load.limit}h`
          : `${load.used}h`;

        const collapseToggle = document.createElement('button');
        collapseToggle.type = 'button';
        collapseToggle.className = 'btn btn-ghost btn-xs';
        collapseToggle.textContent = collapsed ? '▸' : '▾';
        collapseToggle.title = collapsed ? 'Aufklappen' : 'Zuklappen';
        collapseToggle.addEventListener('click', () => {
          setTeacherCollapsed(teacher.id, !collapsed);
          renderBoard();
        });

        headerRight.append(loadBadge, collapseToggle);
        header.append(headerLeft, headerRight);

        const dropZone = document.createElement('div');
        dropZone.className = 'space-y-2 rounded-lg border border-dashed border-base-300 bg-base-200/30 p-3 min-h-[80px] transition';
        dropZone.dataset.teacherId = String(teacher.id);

        const hint = document.createElement('p');
        hint.className = 'text-xs opacity-60';
        hint.textContent = 'Ziehen Sie Fächer hierher, um Stunden zuzuweisen.';
        dropZone.appendChild(hint);

        const assignmentList = document.createElement('div');
        assignmentList.className = 'flex flex-wrap gap-2';

        if (teacherAssignments && teacherAssignments.size) {
          teacherAssignments.forEach(entry => {
            const subject = maps.subjects.get(entry.subjectId);
            const cls = maps.classes.get(entry.classId);

            const row = document.createElement('div');
            row.className = 'inline-flex items-center gap-3 rounded-lg border bg-base-100 px-3 py-2 cursor-grab active:cursor-grabbing shadow-sm max-w-full';
            row.style.flexBasis = 'calc(50% - 0.5rem)';
            row.draggable = true;
            row.style.borderColor = subject?.color || 'transparent';

            const labelCol = document.createElement('div');
            labelCol.className = 'flex flex-col leading-tight text-left';
            const subjectLine = document.createElement('span');
            subjectLine.className = 'font-semibold text-xs';
            subjectLine.textContent = subject?.kuerzel || subject?.name || 'Fach';
            const badgeCount = document.createElement('span');
            badgeCount.className = 'badge badge-sm badge-primary';
            badgeCount.textContent = String(entry.total);
            const subjectWrap = document.createElement('span');
            subjectWrap.className = 'flex items-center gap-2';
            subjectWrap.append(subjectLine, badgeCount);
            const classLine = document.createElement('span');
            classLine.className = 'text-[11px] opacity-70';
            classLine.textContent = cls?.name || 'Klasse';
            const metaLine = document.createElement('span');
            metaLine.className = 'text-[10px] opacity-60';
            metaLine.textContent = requirementMetaSummary(entry);
            labelCol.append(subjectWrap, classLine, metaLine);

            const controls = document.createElement('div');
            controls.className = 'flex items-center gap-1';

            const infoBtn = document.createElement('button');
            infoBtn.type = 'button';
            infoBtn.className = 'btn btn-ghost btn-xs';
            infoBtn.textContent = 'ℹ';
            infoBtn.title = 'Konfiguration anzeigen';

            const minusBtn = document.createElement('button');
            minusBtn.type = 'button';
            minusBtn.className = 'btn btn-ghost btn-xs';
            minusBtn.textContent = '−';

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'btn btn-ghost btn-xs text-error';
            removeBtn.textContent = '×';

            controls.append(infoBtn, minusBtn, removeBtn);
            row.append(labelCol, controls);
            assignmentList.appendChild(row);

            row.addEventListener('dragstart', event => {
              currentDragPayload = {
                kind: 'assignment',
                teacherId: teacher.id,
                classId: entry.classId,
                subjectId: entry.subjectId,
                count: entry.mandatory || 0,
              };
              event.dataTransfer.effectAllowed = 'move';
              const payload = JSON.stringify(currentDragPayload);
              event.dataTransfer.setData('application/json', payload);
              event.dataTransfer.setData('text/plain', payload);
            });

            row.addEventListener('dragend', () => {
              currentDragPayload = null;
            });

            infoBtn.addEventListener('click', () => promptSubjectConfigNavigation(entry));
            minusBtn.addEventListener('click', () => adjustAssignment(entry, teacher.id, -1));
            removeBtn.addEventListener('click', async () => {
              const confirmed = await confirmModal({
                title: 'Zuweisung entfernen',
                message: `Alle ${entry.total} Stunden für ${subject?.name || 'Fach'} in ${cls?.name || 'Klasse'} entfernen?`,
                confirmText: 'Entfernen',
              });
              if (!confirmed) return;
              adjustAssignment(entry, teacher.id, -entry.total);
            });
          });
        }

        if (teacherAssignments && teacherAssignments.size && hint.parentElement) {
          hint.remove();
        }

        dropZone.appendChild(assignmentList);

        const highlight = () => dropZone.classList.add('border-primary', 'bg-primary/10');
        const unhighlight = () => dropZone.classList.remove('border-primary', 'bg-primary/10');

        const computeAcceptance = data => {
          if (!data) return false;
          if (data.kind === 'assignment') {
            return canAcceptAssignmentMove(teacher.id, data, teacherLoads);
          }
          const amount = data.count && data.count > 0 ? data.count : 1;
          const key = `${data.classId}|${data.subjectId}`;
          const info = remainingCache.get(key);
          if (!info || info.remaining == null || info.remaining < amount) return false;
          const isOptional = (info.participation || 'curriculum') === 'ag';
          return canAssignHour(teacher.id, data.classId, data.subjectId, remainingCache, teacherLoads, amount, { isOptional });
        };

        dropZone.addEventListener('dragenter', event => {
          const data = getDragData(event);
          if (!data) return;
          event.preventDefault();
          if (computeAcceptance(data)) highlight();
        });

        dropZone.addEventListener('dragover', event => {
          const data = getDragData(event);
          if (!data) return;
          const canAccept = computeAcceptance(data);
          event.preventDefault();
          if (!canAccept) {
            event.dataTransfer.dropEffect = 'none';
          } else if (data.kind === 'assignment') {
            event.dataTransfer.dropEffect = 'move';
          } else {
            event.dataTransfer.dropEffect = 'copy';
          }
          if (canAccept) {
            highlight();
          } else {
            unhighlight();
          }
        });

        dropZone.addEventListener('dragleave', () => {
          unhighlight();
        });

        dropZone.addEventListener('drop', async event => {
          unhighlight();
          event.preventDefault();
          const data = getDragData(event);
          if (!data) return;
          if (!computeAcceptance(data)) return;
          if (data.kind === 'assignment') {
            await moveAssignmentBlock(data.teacherId, teacher.id, data.classId, data.subjectId);
          } else {
            const amount = data.count && data.count > 0 ? data.count : 1;
            const revertOptimistic = applyOptimisticDrop(data.classId, data.subjectId, amount);
            const success = await assignHour(teacher.id, data.classId, data.subjectId, amount);
            if (!success) {
              revertOptimistic();
            }
          }
          currentDragPayload = null;
        });

        if (remainingCapacity <= 0 && Number.isFinite(load.limit)) {
          dropZone.classList.add('opacity-50');
          if (hint.parentElement) hint.textContent = 'Deputat ausgeschöpft.';
        }

        if (collapsed) {
          dropZone.style.display = 'none';
        }

        body.append(header);
        if (!collapsed) body.append(dropZone);
        teacherCard.appendChild(body);
        teachersWrap.appendChild(teacherCard);
      });

      teacherScroller.appendChild(teachersWrap);
      teacherColumn.appendChild(teacherScroller);
    }

    board.appendChild(teacherColumn);
    boardSection.appendChild(board);

    function applyOptimisticDrop(classId, subjectId, amount = 1) {
      clearPaletteEmpty();
      const key = `${classId}|${subjectId}`;
      const cacheInfo = remainingCache.get(key);
      if (cacheInfo && typeof cacheInfo.remaining === 'number') {
        cacheInfo.remaining = Math.max(0, cacheInfo.remaining - amount);
      }

      const badgeEntry = paletteBadges.get(key);
      if (badgeEntry) {
        const current = Number.parseInt(badgeEntry.badge.textContent, 10) || 0;
        const next = Math.max(0, current - amount);
        badgeEntry.badge.textContent = String(next);
        if (next <= 0 && badgeEntry.pill.parentElement) {
          badgeEntry.pill.remove();
          paletteBadges.delete(key);
        }
      }

      const classEntry = classCards.get(classId);
      if (classEntry) {
        classEntry.remaining = Math.max(0, classEntry.remaining - amount);
        classEntry.badge.textContent = `${classEntry.remaining} h offen`;
        if (classEntry.remaining <= 0 || classEntry.pillWrap.children.length === 0) {
          classEntry.card.remove();
          classCards.delete(classId);
          if (classCards.size === 0) {
            showPaletteEmpty();
          }
        }
      }

      return () => {
        renderBoard();
      };
    }
  }

  function hasRemaining(remainingMap) {
    return Array.from(remainingMap.values()).some(info => info.remaining > 0);
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

function countRemainingHours(map) {
  let total = 0;
  map.forEach(info => {
    total += Math.max(0, info.remaining || 0);
  });
  return total;
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

  function computePaletteClassOrder(groupedRemaining) {
    const classIds = new Set(groupedRemaining.keys());
    const baseOrder = stateClassesSorted();
    const result = [];

    baseOrder.forEach(cls => {
      if (classIds.has(cls.id)) result.push(cls);
    });

    classIds.forEach(id => {
      if (!result.some(cls => cls.id === id)) {
        const clsEntry = maps.classes.get(id);
        result.push({
          id,
          name: clsEntry?.name || `Klasse #${id}`,
        });
      }
    });
    return result;
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
      confirmButtonClass: 'btn btn-sm btn-primary',
      cancelButtonClass: 'btn btn-sm btn-ghost',
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

function isTeacherCollapsed(id) {
  return state.collapsedTeachers.has(id);
}

function setTeacherCollapsed(id, collapsed) {
  if (collapsed) {
    state.collapsedTeachers.add(id);
  } else {
    state.collapsedTeachers.delete(id);
  }
}

  initialize();
  return container;
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
