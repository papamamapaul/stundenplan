const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_DEFINITIONS = {
  AlertCircle: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['line', { x1: '12', y1: '8', x2: '12', y2: '12' }],
    ['line', { x1: '12', y1: '16', x2: '12.01', y2: '16' }],
  ],
  ArrowLeftRight: [
    ['path', { d: 'm19 17 4-4-4-4' }],
    ['path', { d: 'M15 17h8' }],
    ['path', { d: 'm5 7-4 4 4 4' }],
    ['path', { d: 'M9 7H1' }],
  ],
  Building: [
    ['path', { d: 'M3 21h18' }],
    ['path', { d: 'M5 21V9L12 4l7 5v12' }],
    ['path', { d: 'M9 21v-6h6v6' }],
    ['path', { d: 'M9 12h6' }],
  ],
  Ban: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'm4.9 4.9 14.2 14.2' }],
  ],
  BookOpen: [
    ['path', { d: 'M2 7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z' }],
    ['path', { d: 'M22 7a2 2 0 0 0-2-2h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2z' }],
  ],
  Calendar: [
    ['rect', { x: '3', y: '4', width: '18', height: '18', rx: '2', ry: '2' }],
    ['line', { x1: '16', y1: '2', x2: '16', y2: '6' }],
    ['line', { x1: '8', y1: '2', x2: '8', y2: '6' }],
    ['line', { x1: '3', y1: '10', x2: '21', y2: '10' }],
  ],
  CalendarCheck: [
    ['rect', { x: '3', y: '4', width: '18', height: '18', rx: '2', ry: '2' }],
    ['line', { x1: '16', y1: '2', x2: '16', y2: '6' }],
    ['line', { x1: '8', y1: '2', x2: '8', y2: '6' }],
    ['line', { x1: '3', y1: '10', x2: '21', y2: '10' }],
    ['path', { d: 'm9 15 2 2 4-4' }],
  ],
  Check: [
    ['path', { d: 'M20 6 9 17l-5-5' }],
  ],
  ChevronDown: [
    ['path', { d: 'm6 9 6 6 6-6' }],
  ],
  ChevronUp: [
    ['path', { d: 'm18 15-6-6-6 6' }],
  ],
  Clipboard: [
    ['path', { d: 'M16 4h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1' }],
    ['rect', { x: '9', y: '2', width: '6', height: '4', rx: '1' }],
  ],
  Filter: [
    ['path', { d: 'M4 21h16' }],
    ['path', { d: 'M4 14h10' }],
    ['path', { d: 'M4 7h18' }],
    ['path', { d: 'M14 14v7' }],
    ['path', { d: 'M18 7v14.5' }],
    ['path', { d: 'M8 7v7' }],
  ],
  GripVertical: [
    ['circle', { cx: '9', cy: '5', r: '1' }],
    ['circle', { cx: '15', cy: '5', r: '1' }],
    ['circle', { cx: '9', cy: '12', r: '1' }],
    ['circle', { cx: '15', cy: '12', r: '1' }],
    ['circle', { cx: '9', cy: '19', r: '1' }],
    ['circle', { cx: '15', cy: '19', r: '1' }],
  ],
  Layers: [
    ['path', { d: 'M12 2 2 7l10 5 10-5z' }],
    ['path', { d: 'M2 12l10 5 10-5' }],
    ['path', { d: 'M2 17l10 5 10-5' }],
  ],
  Lock: [
    ['rect', { x: '3', y: '11', width: '18', height: '11', rx: '2', ry: '2' }],
    ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }],
  ],
  LayoutDashboard: [
    ['rect', { x: '3', y: '3', width: '8', height: '8', rx: '1' }],
    ['rect', { x: '13', y: '3', width: '8', height: '5', rx: '1' }],
    ['rect', { x: '13', y: '10', width: '8', height: '11', rx: '1' }],
    ['rect', { x: '3', y: '13', width: '8', height: '8', rx: '1' }],
  ],
  Puzzle: [
    ['path', { d: 'M20 13a2 2 0 0 1-2 2h-3v3a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1a1 1 0 0 0-1-1H7a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h1a1 1 0 0 0 1-1V8a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3h3a2 2 0 0 1 2 2z' }],
  ],
  Plus: [
    ['line', { x1: '12', y1: '5', x2: '12', y2: '19' }],
    ['line', { x1: '5', y1: '12', x2: '19', y2: '12' }],
  ],
  Search: [
    ['circle', { cx: '11', cy: '11', r: '7' }],
    ['line', { x1: '21', y1: '21', x2: '16.65', y2: '16.65' }],
  ],
  SlidersHorizontal: [
    ['path', { d: 'M21 4H4' }],
    ['path', { d: 'M14 4v4' }],
    ['path', { d: 'M4 12h17' }],
    ['path', { d: 'M8 12v4' }],
    ['path', { d: 'M21 20H4' }],
    ['path', { d: 'M16 20v-4' }],
  ],
  Table: [
    ['rect', { x: '3', y: '4', width: '18', height: '16', rx: '2', ry: '2' }],
    ['line', { x1: '3', y1: '10', x2: '21', y2: '10' }],
    ['line', { x1: '3', y1: '16', x2: '21', y2: '16' }],
    ['line', { x1: '9', y1: '4', x2: '9', y2: '20' }],
    ['line', { x1: '15', y1: '4', x2: '15', y2: '20' }],
  ],
  Terminal: [
    ['rect', { x: '3', y: '4', width: '18', height: '16', rx: '2', ry: '2' }],
    ['path', { d: 'm7 8 4 4-4 4' }],
    ['line', { x1: '13', y1: '16', x2: '17', y2: '16' }],
  ],
  Unlock: [
    ['path', { d: 'M5 11V7a5 5 0 0 1 9.9-1' }],
    ['rect', { x: '3', y: '11', width: '18', height: '11', rx: '2', ry: '2' }],
  ],
  User: [
    ['path', { d: 'M20 21v-2a4 4 0 0 0-3-3.87' }],
    ['path', { d: 'M4 21v-2a4 4 0 0 1 3-3.87' }],
    ['circle', { cx: '12', cy: '7', r: '4' }],
  ],
  Users: [
    ['path', { d: 'M16 21v-2a4 4 0 0 0-3-3.87' }],
    ['path', { d: 'M8 21v-2a4 4 0 0 1 3-3.87' }],
    ['circle', { cx: '12', cy: '7', r: '4' }],
    ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }],
    ['path', { d: 'M2 21v-2a4 4 0 0 1 3-3.87' }],
    ['circle', { cx: '5', cy: '7', r: '3' }],
    ['circle', { cx: '19', cy: '7', r: '3' }],
  ],
  X: [
    ['path', { d: 'M18 6 6 18' }],
    ['path', { d: 'm6 6 12 12' }],
  ],
};

export function createIcon(name, options = {}) {
  const definition = ICON_DEFINITIONS[name];
  if (!definition) {
    throw new Error(`Icon "${name}" ist nicht definiert.`);
  }

  const {
    size = 20,
    strokeWidth = 2,
    className = '',
    title,
  } = options;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(strokeWidth));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  if (className) {
    svg.setAttribute('class', className);
  }

  if (title) {
    const titleNode = document.createElementNS(SVG_NS, 'title');
    titleNode.textContent = title;
    svg.appendChild(titleNode);
  }

  definition.forEach(([tag, attrs]) => {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => {
      node.setAttribute(key, value);
    });
    svg.appendChild(node);
  });

  return svg;
}

export const ICONS = Object.freeze({
  ALERT_CIRCLE: 'AlertCircle',
  ARROW_LEFT_RIGHT: 'ArrowLeftRight',
  BUILDING: 'Building',
  BAN: 'Ban',
  BOOK_OPEN: 'BookOpen',
  CALENDAR: 'Calendar',
  CALENDAR_CHECK: 'CalendarCheck',
  CHECK: 'Check',
  CHEVRON_DOWN: 'ChevronDown',
  CHEVRON_UP: 'ChevronUp',
  CLIPBOARD: 'Clipboard',
  FILTER: 'Filter',
  GRIP_VERTICAL: 'GripVertical',
  LAYERS: 'Layers',
  LAYOUT_DASHBOARD: 'LayoutDashboard',
  PUZZLE: 'Puzzle',
  PLUS: 'Plus',
  SEARCH: 'Search',
  SLIDERS_HORIZONTAL: 'SlidersHorizontal',
  TABLE: 'Table',
  TERMINAL: 'Terminal',
  LOCK: 'Lock',
  UNLOCK: 'Unlock',
  USER: 'User',
  USERS: 'Users',
  X: 'X',
});
