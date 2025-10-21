const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
const DAY_LABELS = {
  Mo: 'Montag',
  Di: 'Dienstag',
  Mi: 'Mittwoch',
  Do: 'Donnerstag',
  Fr: 'Freitag',
};

export function createPlanGrid({
  slots = [],
  classes = new Map(),
  subjects = new Map(),
  teachers = new Map(),
  visibleClasses,
  highlightedTeacherId = null,
}) {
  const classIds = Array.from(visibleClasses && visibleClasses.size ? visibleClasses : classes.keys());
  if (!classIds.length) {
    const info = document.createElement('p');
    info.className = 'text-sm opacity-70';
    info.textContent = 'Keine Klassen ausgewählt.';
    return info;
  }

  const orderedClassIds = classIds.sort((a, b) => getClassName(classes, a).localeCompare(getClassName(classes, b)));

  const slotMap = new Map();
  slots.forEach(slot => {
    slotMap.set(`${slot.tag}-${slot.class_id}-${slot.stunde}`, slot);
  });

  const maxPeriod = slots.length ? Math.max(...slots.map(slot => Number(slot.stunde))) : 8;
  const periods = Array.from({ length: Math.max(maxPeriod, 8) }, (_, idx) => idx + 1);

  const table = document.createElement('table');
  table.className = 'w-full border-collapse text-sm';

  const thead = document.createElement('thead');
  const dayRow = document.createElement('tr');
  const timeHeader = document.createElement('th');
  timeHeader.rowSpan = 2;
  timeHeader.className = 'bg-base-200 text-left uppercase text-xs tracking-wide px-4 py-3 border border-base-300 min-w-[90px]';
  timeHeader.textContent = 'Zeit';
  dayRow.appendChild(timeHeader);

  DAYS.forEach(day => {
    const th = document.createElement('th');
    th.colSpan = orderedClassIds.length;
    th.className = 'bg-base-200 text-center text-sm font-semibold px-4 py-3 border border-base-300';
    th.textContent = DAY_LABELS[day] || day;
    dayRow.appendChild(th);
  });
  thead.appendChild(dayRow);

  const classRow = document.createElement('tr');
  DAYS.forEach((day, dayIdx) => {
    orderedClassIds.forEach(classId => {
      const th = document.createElement('th');
      const stripe = dayIdx % 2 === 0 ? 'bg-base-100' : 'bg-base-200/60';
      th.className = `${stripe} text-center text-xs font-medium px-3 py-2 border border-base-300`;
      th.textContent = getClassName(classes, classId);
      classRow.appendChild(th);
    });
  });
  thead.appendChild(classRow);

  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  periods.forEach(period => {
    const tr = document.createElement('tr');
    const periodCell = document.createElement('th');
    periodCell.className = 'bg-base-100 px-3 py-4 text-left text-xs font-semibold border border-base-300';
    periodCell.textContent = `${period}. Stunde`;
    tr.appendChild(periodCell);

    DAYS.forEach((day, dayIdx) => {
      orderedClassIds.forEach(classId => {
        const td = document.createElement('td');
        const stripe = dayIdx % 2 === 0 ? 'bg-base-100' : 'bg-base-200/40';
        td.className = `align-top p-1.5 border border-base-200 ${stripe} min-w-[150px]`;
        const slot = slotMap.get(`${day}-${classId}-${period}`);
        td.appendChild(renderSlotCard(slot, { subjects, teachers, highlightedTeacherId }));
        tr.appendChild(td);
      });
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);

  const wrapper = document.createElement('div');
  wrapper.className = 'overflow-x-auto';
  wrapper.appendChild(table);
  return wrapper;
}

function renderSlotCard(slot, { subjects, teachers, highlightedTeacherId }) {
  const card = document.createElement('div');
  card.className = 'h-full min-h-[72px] rounded-lg border border-dashed border-base-300 bg-base-200/40 flex flex-col justify-center items-center text-[11px] text-base-content/60';

  if (!slot) {
    card.textContent = 'frei';
    return card;
  }

  card.className = 'h-full min-h-[72px] rounded-lg border border-base-300 bg-base-100 px-2.5 py-2 flex flex-col gap-1 shadow-sm';

  const subject = subjects.get(slot.subject_id);
  const teacher = teachers.get(slot.teacher_id);

  if (subject?.color) {
    const bg = colorToRgba(subject.color, 0.25);
    const border = colorToRgba(subject.color, 0.6) || subject.color;
    if (bg) card.style.backgroundColor = bg;
    if (border) card.style.borderColor = border;
  }

  const subjectLine = document.createElement('div');
  subjectLine.className = 'font-semibold text-xs uppercase tracking-wide text-base-content';
  subjectLine.textContent = subject?.kuerzel || subject?.name || `Fach #${slot.subject_id}`;
  card.appendChild(subjectLine);

  if (teacher) {
    const teacherLine = document.createElement('div');
    teacherLine.className = 'text-[11px] opacity-80';
    teacherLine.textContent = teacher.kuerzel || teacher.name || '';
    if (teacherLine.textContent) card.appendChild(teacherLine);
  }

  if (slot.is_fixed || slot.is_flexible) {
    const markers = document.createElement('div');
    markers.className = 'flex flex-wrap items-center gap-1 mt-auto';
    if (slot.is_fixed) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-xs badge-outline badge-primary';
      badge.textContent = 'Fix';
      markers.appendChild(badge);
    }
    if (slot.is_flexible) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-xs badge-outline';
      badge.textContent = 'Option';
      markers.appendChild(badge);
    }
    if (markers.childElementCount) card.appendChild(markers);
  }

  const teacherId = teacher?.id ?? slot.teacher_id;
  if (highlightedTeacherId != null && teacherId != null && Number(teacherId) === Number(highlightedTeacherId)) {
    card.classList.add('ring', 'ring-primary', 'ring-offset-2');
  }

  return card;
}

function getClassName(classes, classId) {
  return classes.get(classId)?.name || `Klasse #${classId}`;
}

function colorToRgba(hex, alpha) {
  if (typeof hex !== 'string') return null;
  const cleaned = hex.trim().replace('#', '');
  if (cleaned.length !== 6) return null;
  const num = Number.parseInt(cleaned, 16);
  if (Number.isNaN(num)) return null;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
