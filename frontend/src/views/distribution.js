import { fetchTeachers } from '../api/teachers.js';
import { fetchClasses } from '../api/classes.js';
import { fetchSubjects } from '../api/subjects.js';
import { fetchCurriculum } from '../api/curriculum.js';
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
  };

  const maps = {
    classes: new Map(),
    subjects: new Map(),
    teachers: new Map(),
  };

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
      const [teachers, classes, subjects, curriculum, versions] = await Promise.all([
        fetchTeachers(),
        fetchClasses(),
        fetchSubjects(),
        fetchCurriculum(),
        fetchVersions(),
      ]);
      state.teachers = teachers;
      state.classes = classes;
      state.subjects = subjects;
      state.curriculum = curriculum;
      state.versions = versions;

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
      meta.innerHTML = `
        <span>#{${version.id}}</span>
        <span>${formatDate(version.updated_at || version.created_at)}</span>
      `;

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
    const assignments = groupAssignmentsByTeacher();
    const teacherLoads = computeTeacherLoads(assignments);

    const board = document.createElement('div');
    board.className = 'grid gap-6 lg:grid-cols-[minmax(260px,320px)_1fr]';

    const palette = document.createElement('div');
    palette.className = 'space-y-4';
    palette.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-lg font-semibold">Fächer-Palette</h3>
        <span class="badge badge-outline">${countRemainingHours(remainingMap)} Stunden offen</span>
      </div>
    `;

    const groupedRemaining = new Map();
    remainingMap.forEach(info => {
      if (!info || info.remaining <= 0) return;
      const classId = info.classId;
      const list = groupedRemaining.get(classId) ?? [];
      list.push(info);
      groupedRemaining.set(classId, list);
    });

    const hasRemaining = Array.from(groupedRemaining.values()).some(list => list.length > 0);

    if (!hasRemaining) {
      const empty = document.createElement('div');
      empty.className = 'alert alert-success text-sm';
      empty.textContent = 'Alle Stunden sind verteilt.';
      palette.appendChild(empty);
    } else {
      const classesToShow = computePaletteClassOrder(groupedRemaining);

      const grid = document.createElement('div');
      grid.className = 'grid gap-4';

      classesToShow.forEach(cls => {
        const remainingList = groupedRemaining.get(cls.id) || [];
        if (!remainingList.length) return;

        remainingList.sort((a, b) => {
          const subA = maps.subjects.get(a.subjectId);
          const subB = maps.subjects.get(b.subjectId);
          return (subA?.name || '').localeCompare(subB?.name || '');
        });

        const card = document.createElement('article');
        card.className = 'card bg-base-100 border border-base-200 shadow-sm';

        const body = document.createElement('div');
        body.className = 'card-body';

        const header = document.createElement('div');
        header.className = 'flex items-center justify-between gap-2';
        const title = document.createElement('h4');
        title.className = 'font-semibold text-sm';
        title.textContent = formatClassLabel(cls);
        const count = remainingList.reduce((sum, info) => sum + (info.remaining || 0), 0);
        const badge = document.createElement('span');
        badge.className = 'badge badge-outline badge-sm';
        badge.textContent = `${count} h offen`;
        header.append(title, badge);

        const pillWrap = document.createElement('div');
        pillWrap.className = 'flex flex-wrap gap-2';

        remainingList.forEach(info => {
          const subject = maps.subjects.get(info.subjectId);

          const pill = document.createElement('span');
          pill.className = 'badge badge-outline gap-2 px-3 py-2 cursor-grab active:cursor-grabbing border';

          if (subject?.color) {
            pill.style.borderColor = subject.color;
          }
          pill.draggable = true;
          pill.dataset.key = `${info.classId}|${info.subjectId}`;

          const labelWrap = document.createElement('span');
          labelWrap.className = 'flex flex-col text-left leading-tight';
          const subjectLabel = document.createElement('span');
          subjectLabel.className = 'font-medium text-xs';
          subjectLabel.textContent = formatSubjectLabel(subject);
          labelWrap.appendChild(subjectLabel);

          const countBadge = document.createElement('span');
          countBadge.className = 'badge badge-primary badge-xs';
          countBadge.textContent = String(info.remaining);

          pill.append(labelWrap, countBadge);

          pill.addEventListener('dragstart', event => {
            event.dataTransfer.effectAllowed = 'copy';
            event.dataTransfer.setData('application/json', JSON.stringify({ classId: info.classId, subjectId: info.subjectId }));
          });

          pillWrap.appendChild(pill);
        });

        body.append(header, pillWrap);
        card.appendChild(body);
        grid.appendChild(card);
      });

      palette.appendChild(grid);
    }

    board.appendChild(palette);

    const teacherColumn = document.createElement('div');
    teacherColumn.className = 'space-y-4';

    const teachersWrap = document.createElement('div');
    teachersWrap.className = 'grid gap-4 md:grid-cols-2 xl:grid-cols-3';

    state.teachers
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .forEach(teacher => {
        const load = teacherLoads.get(teacher.id) ?? { used: 0, limit: getTeacherLimit(teacher) };
        const remainingCapacity = Math.max(0, (load.limit ?? Infinity) - load.used);

        const teacherCard = document.createElement('article');
        teacherCard.className = `card bg-base-100 border border-base-200 shadow-sm transition`;
        teacherCard.dataset.teacherId = String(teacher.id);

        const body = document.createElement('div');
        body.className = 'card-body space-y-4';

        const header = document.createElement('div');
        header.className = 'flex items-start justify-between gap-3';
        const nameBlock = document.createElement('div');
        nameBlock.innerHTML = `
          <h3 class="card-title text-base">${teacher.name || teacher.kuerzel || `#${teacher.id}`}</h3>
          <p class="text-xs opacity-70">${teacher.kuerzel ? `Kürzel: ${teacher.kuerzel}` : ''}</p>
        `;
        const loadBadge = document.createElement('span');
        loadBadge.className = 'badge badge-outline';
        loadBadge.textContent = `${load.used} / ${Number.isFinite(load.limit) ? load.limit : '∞'} Std.`;
        header.append(nameBlock, loadBadge);

        const dropZone = document.createElement('div');
        dropZone.className = 'space-y-2 rounded-lg border border-dashed border-base-300 bg-base-200/30 p-3 min-h-[96px] transition';
        dropZone.dataset.teacherId = String(teacher.id);
        dropZone.innerHTML = `
          <p class="text-xs opacity-60">Ziehen Sie Fächer hierher, um Stunden zuzuweisen.</p>
        `;

        const assignmentList = document.createElement('div');
        assignmentList.className = 'flex flex-col gap-2';

        const teacherAssignments = assignments.get(teacher.id);
        if (teacherAssignments && teacherAssignments.size) {
          assignmentList.innerHTML = '';
          teacherAssignments.forEach(entry => {
            const subject = maps.subjects.get(entry.subjectId);
            const cls = maps.classes.get(entry.classId);

            const row = document.createElement('div');
            row.className = 'flex items-center justify-between gap-2 rounded-lg border bg-base-100 px-3 py-2';
            row.style.borderColor = subject?.color || 'transparent';

            row.innerHTML = `
              <div class="flex flex-col">
                <span class="font-medium">${subject?.kuerzel || subject?.name || 'Fach'} <span class="badge badge-sm">${entry.total}</span></span>
                <span class="text-xs opacity-70">${cls?.name || 'Klasse'}</span>
              </div>
            `;

            const controls = document.createElement('div');
            controls.className = 'flex items-center gap-1';

            const minusBtn = document.createElement('button');
            minusBtn.type = 'button';
            minusBtn.className = 'btn btn-xs btn-outline';
            minusBtn.textContent = '−';

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'btn btn-xs btn-ghost text-error';
            removeBtn.textContent = '×';

            controls.append(minusBtn, removeBtn);
            row.appendChild(controls);
            assignmentList.appendChild(row);

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

        dropZone.appendChild(assignmentList);

        dropZone.addEventListener('dragover', event => {
          if (!hasRemaining(remainingMap)) return;
          const data = getDragData(event);
          if (!data) return;
          const canAccept = canAssignHour(teacher.id, data.classId, data.subjectId, remainingMap, teacherLoads);
          if (!canAccept) return;
          event.preventDefault();
          dropZone.classList.add('border-primary', 'bg-primary/10');
          event.dataTransfer.dropEffect = 'copy';
        });

        dropZone.addEventListener('dragleave', () => {
          dropZone.classList.remove('border-primary', 'bg-primary/10');
        });

        dropZone.addEventListener('drop', async event => {
          dropZone.classList.remove('border-primary', 'bg-primary/10');
          event.preventDefault();
          const data = getDragData(event);
          if (!data) return;
          const canAccept = canAssignHour(teacher.id, data.classId, data.subjectId, remainingMap, teacherLoads);
          if (!canAccept) return;
          await assignHour(teacher.id, data.classId, data.subjectId);
        });

        if (remainingCapacity <= 0 && Number.isFinite(load.limit)) {
          dropZone.classList.add('opacity-50');
          dropZone.querySelector('p').textContent = 'Deputat ausgeschöpft.';
        }

        body.append(header, dropZone);
        teacherCard.appendChild(body);
        teachersWrap.appendChild(teacherCard);
      });

    teacherColumn.appendChild(teachersWrap);
    board.appendChild(teacherColumn);
    boardSection.appendChild(board);
  }

  function hasRemaining(remainingMap) {
    return Array.from(remainingMap.values()).some(info => info.remaining > 0);
  }

  function canAssignHour(teacherId, classId, subjectId, remainingMap, teacherLoads) {
    const key = `${classId}|${subjectId}`;
    const info = remainingMap.get(key);
    if (!info || info.remaining <= 0) return false;
    const load = teacherLoads.get(teacherId);
    if (!load) return true;
    if (!Number.isFinite(load.limit)) return true;
    return load.used < load.limit;
  }

  async function assignHour(teacherId, classId, subjectId) {
    const key = `${classId}|${subjectId}`;
    const existing = findRequirement(teacherId, classId, subjectId);
    setStatus('Speichere Zuweisung…');
    try {
      if (existing) {
        const payload = {
          class_id: existing.class_id,
          subject_id: existing.subject_id,
          teacher_id: existing.teacher_id,
          version_id: existing.version_id,
          wochenstunden: (existing.wochenstunden || 0) + 1,
          doppelstunde: existing.doppelstunde ?? null,
          nachmittag: existing.nachmittag ?? null,
        };
        const updated = await updateRequirement(existing.id, payload);
        Object.assign(existing, updated);
      } else {
        const created = await createRequirement({
          class_id: classId,
          subject_id: subjectId,
          teacher_id: teacherId,
          version_id: state.selectedVersionId,
          wochenstunden: 1,
        });
        state.requirements.push(created);
      }
      setStatus('Gespeichert.');
      setTimeout(clearStatus, 1500);
      renderBoard();
    } catch (err) {
      setStatus(`Fehler: ${formatError(err)}`, true);
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
          await assignHour(teacherId, entry.classId, entry.subjectId);
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
            records: [],
          };
          teacherMap.set(key, entry);
        }
        entry.total += req.wochenstunden || 0;
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
        ? Array.from(teacherAssignments.values()).reduce((sum, entry) => sum + (entry.total || 0), 0)
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
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.classId !== 'number' || typeof parsed.subjectId !== 'number') return null;
      return parsed;
    } catch {
      return null;
    }
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
