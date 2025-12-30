import { createIcon, ICONS } from './icons.js';

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
  slotsMeta = [],
  classes = new Map(),
  subjects = new Map(),
  teachers = new Map(),
  rooms = new Map(),
  classWindows = new Map(),
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

  const slotMetaArray = Array.isArray(slotsMeta) ? slotsMeta : [];
  const slotMetaByIndex = new Map();
  slotMetaArray.forEach(meta => {
    if (meta && typeof meta.index === 'number') {
      slotMetaByIndex.set(meta.index, meta);
    }
  });

  const slotMap = new Map();
  slots.forEach(slot => {
    slotMap.set(`${slot.tag}-${slot.class_id}-${slot.stunde}`, slot);
  });

  const maxPeriod = slots.length ? Math.max(...slots.map(slot => Number(slot.stunde))) : 0;
  const metaPeriods = slotMetaArray.length ? slotMetaArray.length : 0;
  const periods = Array.from({ length: Math.max(maxPeriod, metaPeriods, 8) }, (_, idx) => idx + 1);

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
    const slotMeta = slotMetaByIndex.get(period - 1);
    const isPause = Boolean(slotMeta?.is_pause);
    periodCell.className = `px-3 py-4 text-left text-xs font-semibold border border-base-300 ${isPause ? 'bg-amber-50 text-amber-700' : 'bg-base-100'}`;
    const label = document.createElement('div');
    label.className = 'uppercase tracking-wide';
    label.textContent = slotMeta
      ? (isPause ? (slotMeta.label || 'Pause') : (slotMeta.label || `${period}. Stunde`))
      : `${period}. Stunde`;
    periodCell.appendChild(label);
    if (slotMeta?.start || slotMeta?.end) {
      const time = document.createElement('div');
      time.className = 'text-[11px] opacity-70 normal-case';
      time.textContent = [slotMeta.start, slotMeta.end].filter(Boolean).join(' – ');
      periodCell.appendChild(time);
    }
    tr.appendChild(periodCell);

    DAYS.forEach((day, dayIdx) => {
      orderedClassIds.forEach(classId => {
        const td = document.createElement('td');
        const stripe = dayIdx % 2 === 0 ? 'bg-base-100' : 'bg-base-200/40';
        const classAllowed = isSlotAllowed(classWindows, classId, day, period - 1);
        if (isPause) {
          td.className = `align-top p-2 border border-base-200 bg-amber-50/50 min-w-[150px]`;
          const pauseBlock = document.createElement('div');
          pauseBlock.className = 'h-full min-h-[64px] flex items-center justify-center text-xs font-semibold uppercase tracking-wide text-amber-700';
          pauseBlock.textContent = slotMeta?.label || 'Pause';
          td.appendChild(pauseBlock);
        } else {
          td.className = `align-top p-1.5 border border-base-200 ${stripe} min-w-[150px]`;
          if (!classAllowed) {
            td.classList.add('plan-cell-blocked');
          }
          const slot = slotMap.get(`${day}-${classId}-${period}`);
          if (slot) {
            td.appendChild(renderSlotCard(slot, { subjects, teachers, rooms, highlightedTeacherId }));
          } else if (!classAllowed) {
            const blockedLabel = document.createElement('div');
            blockedLabel.className = 'plan-cell-blocked-label';
            const blockedIcon = createIcon(ICONS.BAN, { size: 16, className: 'plan-cell-blocked-icon' });
            const blockedText = document.createElement('span');
            blockedText.textContent = 'Gesperrt';
            blockedLabel.append(blockedIcon, blockedText);
            td.appendChild(blockedLabel);
          } else {
            td.appendChild(renderSlotCard(slot, { subjects, teachers, rooms, highlightedTeacherId }));
          }
        }
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

function renderSlotCard(slot, { subjects, teachers, rooms, highlightedTeacherId }) {
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

  const roomName = slot?.room_name || (rooms && rooms.get ? rooms.get(slot?.room_id)?.name : null);
  if (roomName) {
    const roomLine = document.createElement('div');
    roomLine.className = 'text-[10px] uppercase tracking-wide text-blue-700';
    roomLine.textContent = roomName;
    card.appendChild(roomLine);
  }

  if (slot.is_fixed || slot.is_flexible) {
    const markers = document.createElement('div');
    markers.className = 'flex flex-wrap items-center gap-1 mt-auto';
    if (slot.is_fixed) {
      const badge = document.createElement('span');
      badge.className = 'inline-flex items-center gap-1 rounded-full border border-yellow-400 bg-yellow-100/80 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700';
      const icon = createIcon(ICONS.LOCK, { size: 12, className: 'w-3 h-3' });
      badge.append(icon, document.createTextNode('Fix'));
      markers.appendChild(badge);
    }
    if (slot.is_flexible) {
      const badge = document.createElement('span');
      badge.className = 'inline-flex items-center gap-1 rounded-full border border-blue-400 bg-blue-100/70 px-1.5 py-0.5 text-[10px] font-medium text-blue-700';
      const icon = createIcon(ICONS.UNLOCK, { size: 12, className: 'w-3 h-3' });
      badge.append(icon, document.createTextNode('Option'));
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

function isSlotAllowed(classWindows, classId, dayTag, slotIndex) {
  if (!classWindows || typeof classWindows.get !== 'function') return true;
  const classEntry = classWindows.get(Number(classId));
  if (!classEntry) return true;
  const dayEntry = classEntry.get(dayTag);
  if (!Array.isArray(dayEntry)) return true;
  const value = dayEntry[slotIndex];
  return value !== false;
}
