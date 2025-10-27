import { createPlanGrid } from './PlanGrid.js';

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];

export function openPlanPrintModal({ plan, classes, teachers, subjects }) {
  if (!plan || !Array.isArray(plan.slots) || !plan.slots.length) {
    console.warn('PlanPrintModal: no slots available for printing.');
  }

  const dialog = document.createElement('dialog');
  dialog.className = 'modal';

  const modalBox = document.createElement('div');
  modalBox.className = 'modal-box max-w-4xl space-y-4';

  const heading = document.createElement('div');
  heading.className = 'space-y-1';
  const title = document.createElement('h3');
  title.className = 'text-lg font-semibold';
  title.textContent = 'Plan als PDF exportieren';
  const subtitle = document.createElement('p');
  subtitle.className = 'text-sm opacity-70';
  subtitle.textContent = 'Lege fest, welche Ansichten du exportieren möchtest. Jede Auswahl wird als eigene Seite im PDF erzeugt.';
  heading.append(title, subtitle);
  modalBox.appendChild(heading);

  const planName = plan.name || `Plan #${plan.id ?? ''}`;

  const modeWrap = document.createElement('div');
  modeWrap.className = 'space-y-3';
  const modeLabel = document.createElement('p');
  modeLabel.className = 'text-sm font-medium';
  modeLabel.textContent = 'Ansicht wählen';
  modeWrap.appendChild(modeLabel);

  const modeOptions = document.createElement('div');
  modeOptions.className = 'grid gap-2 sm:grid-cols-3';
  modeWrap.appendChild(modeOptions);

  const optionDefs = [
    { id: 'all', title: 'Gesamtplan', description: 'Alle Klassen in einer Übersicht (kompakte Schrift).' },
    { id: 'classes', title: 'Klassenpläne', description: 'Einzelplan pro Klasse (wähle unten die Klassen).' },
    { id: 'teachers', title: 'Lehrerpläne', description: 'Planübersicht je Lehrkraft.' },
  ];

  let mode = 'all';
  const selectedClassIds = new Set();
  const selectedTeacherIds = new Set();

  const classOptions = Array.from(classes.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  classOptions.forEach(cls => selectedClassIds.add(cls.id));
  const teacherOptions = Array.from(teachers.values()).sort((a, b) => getTeacherLabel(a).localeCompare(getTeacherLabel(b)));
  const teacherIdsInPlan = new Set(plan.slots.map(slot => Number(slot.teacher_id)).filter(Boolean));
  teacherOptions.forEach(t => {
    if (teacherIdsInPlan.has(Number(t.id))) {
      selectedTeacherIds.add(t.id);
    }
  });

  optionDefs.forEach(opt => {
    const card = document.createElement('label');
    card.className = 'card cursor-pointer border border-base-200 bg-base-100 shadow-sm transition hover:border-primary';
    const body = document.createElement('div');
    body.className = 'card-body gap-2';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'print-mode';
    radio.value = opt.id;
    radio.className = 'radio radio-primary radio-sm';
    if (opt.id === mode) radio.checked = true;
    radio.addEventListener('change', () => {
      mode = opt.id;
      updateSelectionsVisibility();
    });
    const titleEl = document.createElement('div');
    titleEl.className = 'flex items-center gap-2';
    const titleText = document.createElement('span');
    titleText.className = 'font-semibold';
    titleText.textContent = opt.title;
    titleEl.append(radio, titleText);
    const desc = document.createElement('p');
    desc.className = 'text-xs opacity-70 leading-snug';
    desc.textContent = opt.description;
    body.append(titleEl, desc);
    card.append(body);
    modeOptions.append(card);
  });

  modalBox.appendChild(modeWrap);

  // Selection areas
  const selectionWrap = document.createElement('div');
  selectionWrap.className = 'grid gap-4';

  const classesSection = document.createElement('div');
  classesSection.className = 'space-y-2';
  const classesTitle = document.createElement('p');
  classesTitle.className = 'text-sm font-medium';
  classesTitle.textContent = 'Klassen auswählen';
  const classesList = document.createElement('div');
  classesList.className = 'grid max-h-48 grid-cols-1 gap-2 overflow-y-auto border border-base-200 rounded-lg p-3 sm:grid-cols-2';
  classOptions.forEach(cls => {
    const item = document.createElement('label');
    item.className = 'flex items-center gap-2 text-sm';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checkbox checkbox-sm';
    checkbox.checked = selectedClassIds.has(cls.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedClassIds.add(cls.id);
      } else {
        selectedClassIds.delete(cls.id);
      }
    });
    const label = document.createElement('span');
    label.textContent = cls.name || `Klasse #${cls.id}`;
    item.append(checkbox, label);
    classesList.append(item);
  });
  classesSection.append(classesTitle, classesList);

  const teachersSection = document.createElement('div');
  teachersSection.className = 'space-y-2';
  const teachersTitle = document.createElement('p');
  teachersTitle.className = 'text-sm font-medium';
  teachersTitle.textContent = 'Lehrkräfte auswählen';
  const teachersList = document.createElement('div');
  teachersList.className = 'grid max-h-48 grid-cols-1 gap-2 overflow-y-auto border border-base-200 rounded-lg p-3 sm:grid-cols-2';
  teacherOptions.forEach(teacher => {
    const item = document.createElement('label');
    item.className = 'flex items-center gap-2 text-sm';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checkbox checkbox-sm';
    checkbox.checked = selectedTeacherIds.has(teacher.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedTeacherIds.add(teacher.id);
      } else {
        selectedTeacherIds.delete(teacher.id);
      }
    });
    const label = document.createElement('span');
    label.textContent = getTeacherLabel(teacher);
    item.append(checkbox, label);
    teachersList.append(item);
  });
  teachersSection.append(teachersTitle, teachersList);

  selectionWrap.append(classesSection, teachersSection);
  modalBox.appendChild(selectionWrap);

  const statusLine = document.createElement('p');
  statusLine.className = 'text-sm text-error hidden';
  modalBox.appendChild(statusLine);

  const actions = document.createElement('div');
  actions.className = 'modal-action';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-ghost';
  cancelBtn.textContent = 'Abbrechen';
  cancelBtn.addEventListener('click', () => closeModal());
  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'btn btn-primary';
  confirmBtn.textContent = 'PDF erstellen';
  confirmBtn.addEventListener('click', () => {
    statusLine.classList.add('hidden');
    if (mode === 'classes' && !selectedClassIds.size) {
      statusLine.textContent = 'Bitte mindestens eine Klasse auswählen.';
      statusLine.classList.remove('hidden');
      return;
    }
    if (mode === 'teachers' && !selectedTeacherIds.size) {
      statusLine.textContent = 'Bitte mindestens eine Lehrkraft auswählen.';
      statusLine.classList.remove('hidden');
      return;
    }
    try {
      generateAndPrint({
        mode,
        plan,
        classes,
        teachers,
        subjects,
        planName,
        classIds: mode === 'classes' ? Array.from(selectedClassIds) : [],
        teacherIds: mode === 'teachers' ? Array.from(selectedTeacherIds) : [],
      });
      closeModal();
    } catch (err) {
      console.error('Print generation failed', err);
      statusLine.textContent = `Fehler beim Erstellen der PDF: ${err.message || err}`;
      statusLine.classList.remove('hidden');
    }
  });
  actions.append(cancelBtn, confirmBtn);
  modalBox.appendChild(actions);

  const backdrop = document.createElement('form');
  backdrop.method = 'dialog';
  backdrop.className = 'modal-backdrop';
  const backdropBtn = document.createElement('button');
  backdropBtn.textContent = 'Schließen';
  backdrop.appendChild(backdropBtn);

  dialog.append(modalBox, backdrop);
  document.body.appendChild(dialog);
  dialog.showModal();

  dialog.addEventListener('close', () => {
    dialog.remove();
  });

  function closeModal() {
    if (dialog.open) dialog.close();
  }

  function updateSelectionsVisibility() {
    classesSection.classList.toggle('hidden', mode !== 'classes');
    teachersSection.classList.toggle('hidden', mode !== 'teachers');
  }

  updateSelectionsVisibility();
}

function generateAndPrint({ mode, plan, classes, teachers, subjects, planName, classIds, teacherIds }) {
  const pages = [];
  const allClassIds = Array.from(classes.keys());

  if (mode === 'all') {
    const grid = createPlanGrid({
      slots: plan.slots,
      classes,
      subjects,
      teachers,
      visibleClasses: new Set(allClassIds),
    });
    pages.push(buildPage({
      title: `${planName} – Gesamtplan`,
      subtitle: 'Alle Klassen im Überblick',
      contentNode: grid,
      className: 'page-all',
    }));
  }

  if (mode === 'classes') {
    classIds.forEach(classId => {
      const grid = createPlanGrid({
        slots: plan.slots,
        classes,
        subjects,
        teachers,
        visibleClasses: new Set([classId]),
      });
      const cls = classes.get(classId);
      pages.push(buildPage({
        title: `${planName}`,
        subtitle: `Klasse ${cls?.name || `#${classId}`}`,
        contentNode: grid,
        className: 'page-class',
      }));
    });
  }

  if (mode === 'teachers') {
    teacherIds.forEach(teacherId => {
      const table = createTeacherGrid({
        teacherId,
        plan,
        classes,
        subjects,
        teachers,
      });
      if (!table) return;
      const teacher = teachers.get(teacherId);
      pages.push(buildPage({
        title: `${planName}`,
        subtitle: `Lehrkraft ${getTeacherLabel(teacher)}`,
        contentNode: table,
        className: 'page-teacher',
      }));
    });
  }

  if (!pages.length) {
    throw new Error('Keine Inhalte ausgewählt.');
  }

  const html = buildPrintDocument(pages);
  const printFrame = document.createElement('iframe');
  printFrame.style.position = 'fixed';
  printFrame.style.right = '0';
  printFrame.style.bottom = '0';
  printFrame.style.width = '0';
  printFrame.style.height = '0';
  printFrame.style.border = '0';
  printFrame.style.visibility = 'hidden';
  printFrame.setAttribute('aria-hidden', 'true');

  const cleanup = () => {
    setTimeout(() => {
      if (printFrame.parentNode) {
        printFrame.parentNode.removeChild(printFrame);
      }
    }, 1000);
  };

  const handleLoad = () => {
    try {
      const frameWindow = printFrame.contentWindow;
      frameWindow.focus();
      frameWindow.print();
    } catch (err) {
      console.error('Printing failed', err);
    } finally {
      cleanup();
    }
  };

  printFrame.addEventListener('load', handleLoad, { once: true });
  document.body.appendChild(printFrame);
  printFrame.srcdoc = html;
}

function buildPage({ title, subtitle, contentNode, className }) {
  const wrapper = document.createElement('section');
  wrapper.className = `print-page ${className || ''}`;
  const header = document.createElement('header');
  header.className = 'print-header';
  const titleEl = document.createElement('h1');
  titleEl.className = 'print-title';
  titleEl.textContent = title;
  header.appendChild(titleEl);
  if (subtitle) {
    const subtitleEl = document.createElement('p');
    subtitleEl.className = 'print-subtitle';
    subtitleEl.textContent = subtitle;
    header.appendChild(subtitleEl);
  }
  wrapper.appendChild(header);
  const container = document.createElement('div');
  container.className = 'print-content';
  container.appendChild(contentNode);
  wrapper.appendChild(container);
  const helper = document.createElement('div');
  helper.appendChild(wrapper);
  return helper.innerHTML;
}

function buildPrintDocument(pagesHtml) {
  const styles = `
    @page { size: A4 landscape; margin: 10mm; }
    body { font-family: "Inter", "Helvetica Neue", Arial, sans-serif; color: #111827; background: #ffffff; }
    .print-page { page-break-after: always; page-break-inside: avoid; }
    .print-page:last-child { page-break-after: auto; }
    .print-header { margin-bottom: 8px; }
    .print-title { font-size: 18px; font-weight: 600; margin: 0; }
    .print-subtitle { font-size: 12px; color: #4b5563; margin: 2px 0 0; }
    .print-content { width: 100%; }
    .page-all table { font-size: 9px !important; }
    .page-all th, .page-all td { padding: 4px !important; }
    .page-class table { font-size: 11px !important; }
    .page-class th, .page-class td { padding: 6px !important; }
    .page-teacher table { font-size: 11px !important; }
    .page-teacher th, .page-teacher td { padding: 6px !important; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #d1d5db; }
  `;

  return `
    <!doctype html>
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <title>Stundenplan Export</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/daisyui@4.12.10/dist/full.min.css">
        <style>${styles}</style>
      </head>
      <body>
        ${pagesHtml.join('\n')}
      </body>
    </html>
  `;
}

function createTeacherGrid({ teacherId, plan, classes, subjects, teachers }) {
  const teacher = teachers.get(teacherId);
  if (!teacher) return null;
  const teacherSlots = plan.slots.filter(slot => Number(slot.teacher_id) === Number(teacherId));
  if (!teacherSlots.length) return null;

  const periods = getPeriods(plan.slots);
  const slotMap = new Map();

  teacherSlots.forEach(slot => {
    const key = `${slot.tag}-${slot.stunde}`;
    if (!slotMap.has(key)) slotMap.set(key, []);
    slotMap.get(key).push(slot);
  });

  const table = document.createElement('table');
  table.className = 'w-full text-xs';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const corner = document.createElement('th');
  corner.className = 'bg-base-200 text-left px-3 py-2 font-semibold uppercase tracking-wide';
  corner.textContent = 'Zeit';
  headRow.appendChild(corner);
  DAYS.forEach(day => {
    const th = document.createElement('th');
    th.className = 'bg-base-200 text-center px-3 py-2 font-semibold';
    th.textContent = day;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  periods.forEach(period => {
    const row = document.createElement('tr');
    const periodCell = document.createElement('th');
    periodCell.className = 'bg-base-100 text-left px-3 py-2 font-semibold';
    periodCell.textContent = `${period}. Stunde`;
    row.appendChild(periodCell);

    DAYS.forEach(day => {
      const td = document.createElement('td');
      td.className = 'align-top px-2 py-2';
      const slots = slotMap.get(`${day}-${period}`) || [];
      if (!slots.length) {
        td.textContent = 'frei';
      } else {
        slots.forEach((slot, idx) => {
          const subject = subjects.get(slot.subject_id);
          const cls = classes.get(slot.class_id);
          const line = document.createElement('div');
          line.className = 'flex flex-col text-left gap-0.5';
          const subjectLabel = document.createElement('span');
          subjectLabel.className = 'font-semibold';
          subjectLabel.textContent = subject?.kuerzel || subject?.name || `Fach #${slot.subject_id}`;
          const classLabel = document.createElement('span');
          classLabel.className = 'text-[11px] opacity-80';
          classLabel.textContent = cls?.name || `Klasse #${slot.class_id}`;
          line.append(subjectLabel, classLabel);
          td.appendChild(line);
          if (idx < slots.length - 1) {
            const divider = document.createElement('div');
            divider.className = 'mt-1 border-t border-dashed border-base-300';
            td.appendChild(divider);
          }
        });
      }
      row.appendChild(td);
    });

    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  const wrapper = document.createElement('div');
  wrapper.appendChild(table);
  return wrapper;
}

function getPeriods(slots) {
  const maxPeriod = slots.length ? Math.max(...slots.map(slot => Number(slot.stunde))) : 8;
  return Array.from({ length: Math.max(maxPeriod, 8) }, (_, idx) => idx + 1);
}

function getTeacherLabel(teacher) {
  if (!teacher) return '—';
  return teacher.kuerzel ? `${teacher.kuerzel} (${teacher.name})` : teacher.name || `Lehrer #${teacher.id}`;
}
