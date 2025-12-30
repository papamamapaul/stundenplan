const SIZE_CLASSES = {
  sm: 'w-7 h-7 text-[11px]',
  md: 'w-9 h-9 text-xs',
  lg: 'w-12 h-12 text-base',
};

export const DEFAULT_TEACHER_BADGE_COLOR = '#1f2937';

export function createTeacherBadge(teacher, options = {}) {
  const { size = 'md', interactive = true, onClick, className = '' } = options;
  const Tag = interactive ? 'button' : 'div';
  const badge = document.createElement(Tag);
  if (interactive) badge.type = 'button';
  badge.dataset.testId = 'teacher-badge';
  badge.className = [
    'teacher-badge inline-flex items-center justify-center rounded-full font-semibold',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
    SIZE_CLASSES[size] || SIZE_CLASSES.md,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  applyTeacherBadgeAppearance(badge, teacher);

  if (interactive) {
    badge.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof onClick === 'function') {
        onClick(teacher, event);
      } else {
        showTeacherDetails(teacher);
      }
    });
  }

  return badge;
}

export function updateTeacherBadge(badge, teacher) {
  if (!(badge instanceof HTMLElement)) return;
  applyTeacherBadgeAppearance(badge, teacher);
}

export function showTeacherDetails(teacher) {
  if (!teacher) return;

  const dialog = document.createElement('dialog');
  dialog.className = 'modal';

  const box = document.createElement('div');
  box.className = 'modal-box space-y-4';

  const header = document.createElement('div');
  header.className = 'flex items-center gap-3';
  const badge = createTeacherBadge(teacher, { size: 'md', interactive: false });
  header.appendChild(badge);
  const title = document.createElement('div');
  title.className = 'space-y-1';
  const name = document.createElement('h3');
  name.className = 'font-semibold text-lg';
  name.textContent = buildTeacherName(teacher) || 'Lehrkraft';
  const kuerzel = document.createElement('p');
  kuerzel.className = 'text-sm opacity-70';
  kuerzel.textContent = `Kürzel: ${teacher?.kuerzel || '—'}`;
  title.append(name, kuerzel);
  header.appendChild(title);

  const list = document.createElement('dl');
  list.className = 'space-y-2 text-sm';
  list.append(
    detailRow('Kürzel', teacher?.kuerzel || '—'),
    detailRow('Wochenstunden Soll', formatHours(teacher?.deputat_soll)),
    detailRow('Wochenstunden Ist', formatHours(teacher?.deputat)),
    detailRow('Arbeitstage', formatWorkingDays(teacher)),
  );

  const actions = document.createElement('div');
  actions.className = 'modal-action';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn-sm btn-primary';
  closeBtn.textContent = 'Schließen';
  actions.appendChild(closeBtn);

  const backdrop = document.createElement('form');
  backdrop.method = 'dialog';
  backdrop.className = 'modal-backdrop';
  const backdropBtn = document.createElement('button');
  backdropBtn.textContent = 'Schließen';
  backdrop.appendChild(backdropBtn);

  box.append(header, list, actions);
  dialog.append(box, backdrop);
  document.body.appendChild(dialog);

  function cleanup() {
    dialog.close();
    dialog.remove();
  }

  closeBtn.addEventListener('click', cleanup);
  backdrop.addEventListener('submit', event => {
    event.preventDefault();
    cleanup();
  });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    cleanup();
  });

  dialog.showModal();
}

function applyTeacherBadgeAppearance(node, teacher) {
  const badgeColor = sanitizeColor(teacher?.color) || DEFAULT_TEACHER_BADGE_COLOR;
  node.style.backgroundColor = badgeColor;
  node.style.color = computeContrastColor(badgeColor);
  node.textContent = computeTeacherInitials(teacher);
}

function sanitizeColor(color) {
  if (!color) return null;
  const trimmed = String(color).trim();
  if (!trimmed) return null;
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  return null;
}

function computeTeacherInitials(teacher) {
  if (!teacher) return 'LK';
  if (teacher.kuerzel) return String(teacher.kuerzel).slice(0, 3).toUpperCase();
  const first = teacher.first_name ? String(teacher.first_name).trim() : '';
  const last = teacher.last_name ? String(teacher.last_name).trim() : '';
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
  if (first) return first.slice(0, 2).toUpperCase();
  if (last) return last.slice(0, 2).toUpperCase();
  if (teacher.name) return String(teacher.name).slice(0, 2).toUpperCase();
  return 'LK';
}

function computeContrastColor(hexColor) {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // YIQ formula
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? '#111827' : '#F9FAFB';
}

function buildTeacherName(teacher) {
  if (!teacher) return '';
  const parts = [];
  if (teacher.first_name) parts.push(String(teacher.first_name).trim());
  if (teacher.last_name) parts.push(String(teacher.last_name).trim());
  const name = parts.join(' ').trim();
  if (name) return name;
  return teacher.name || teacher.kuerzel || '';
}

function detailRow(label, value) {
  const row = document.createElement('div');
  row.className = 'flex items-start justify-between gap-3';
  const term = document.createElement('dt');
  term.className = 'font-medium text-gray-600';
  term.textContent = label;
  const desc = document.createElement('dd');
  desc.className = 'text-gray-800 text-right';
  desc.textContent = value;
  row.append(term, desc);
  return row;
}

function formatHours(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value} h`;
  }
  return '—';
}

function formatWorkingDays(teacher) {
  if (!teacher) return '—';
  const mapping = [
    { field: 'work_mo', label: 'Mo' },
    { field: 'work_di', label: 'Di' },
    { field: 'work_mi', label: 'Mi' },
    { field: 'work_do', label: 'Do' },
    { field: 'work_fr', label: 'Fr' },
  ];
  const days = mapping
    .filter(item => teacher[item.field] !== false)
    .map(item => item.label);
  return days.length ? days.join(', ') : '—';
}
