import { fetchTeachers } from '../api/teachers.js';
import { fetchClasses } from '../api/classes.js';
import { fetchSubjects } from '../api/subjects.js';
import { fetchRooms } from '../api/rooms.js';
import { fetchCurriculum } from '../api/curriculum.js';
import { fetchVersions } from '../api/versions.js';
import { fetchBasisplan } from '../api/basisplan.js';
import { fetchPlans } from '../api/plans.js';
import { getPlanningPeriodsSnapshot } from '../store/planningPeriods.js';
import { formatError } from '../utils/ui.js';
import { createIcon, ICONS } from './icons.js';
import { getAuthState, subscribeAuth } from '../store/auth.js';

const NAV_SECTIONS = [
  {
    title: null,
    items: [
      { label: 'Dashboard', hash: '#/dashboard', icon: ICONS.LAYOUT_DASHBOARD, key: 'dashboard' },
    ],
  },
  {
    title: 'Grundeinstellungen',
    items: [
      { label: 'Planungsperioden', hash: '#/planungsperioden', icon: ICONS.CALENDAR, key: 'periods', tab: 'periods' },
      { label: 'Benutzerprofil', hash: '#/benutzerprofil', icon: ICONS.USER, key: 'profile' },
      { label: 'Benutzerverwaltung', hash: '#/admin/users', icon: ICONS.USERS, key: 'admin-users', requiresAdmin: true },
      { label: 'Admin Leitfaden', hash: '#/admin/tutorial', icon: ICONS.BOOK_OPEN, key: 'admin-tutorial', requiresAdmin: true },
    ],
  },
  {
    title: 'Stammdaten',
    items: [
      { label: 'Lehrer', hash: '#/lehrer', icon: ICONS.USERS, key: 'teachers', tab: 'teachers' },
      { label: 'Klassen', hash: '#/klassen', icon: ICONS.LAYERS, key: 'classes', tab: 'classes' },
      { label: 'Fächer', hash: '#/faecher', icon: ICONS.BOOK_OPEN, key: 'subjects', tab: 'subjects' },
      { label: 'Räume', hash: '#/raeume', icon: ICONS.BUILDING, key: 'rooms', tab: 'rooms' },
      { label: 'Stundentafel', hash: '#/stundentafel', icon: ICONS.TABLE, key: 'curriculum', tab: 'curriculum' },
    ],
  },
  {
    title: 'Planung',
    items: [
      { label: 'Stundenverteilung', hash: '#/stundenverteilung', icon: ICONS.PUZZLE, key: 'distribution' },
      { label: 'Basispläne', hash: '#/basisplan', icon: ICONS.CLIPBOARD, key: 'basisplan' },
      { label: 'Planberechnung', hash: '#/plan/new', icon: ICONS.SLIDERS_HORIZONTAL, key: 'plan' },
      { label: 'Pläne', hash: '#/plans', icon: ICONS.CALENDAR_CHECK, key: 'plans' },
      { label: 'Import / Export', hash: '#/backup', icon: ICONS.ARROW_LEFT_RIGHT, key: 'backup' },
    ],
  },
];

const SETUP_STEPS = ['teachers', 'classes', 'subjects', 'rooms', 'curriculum', 'distribution', 'basisplan', 'plan'];

export function createSidebar(onNavigate) {
  const drawer = document.createElement('div');
  drawer.className = 'drawer lg:drawer-open w-full';

  const toggleInput = document.createElement('input');
  toggleInput.id = 'klassenTakt-menu';
  toggleInput.type = 'checkbox';
  toggleInput.className = 'drawer-toggle';

  const drawerContent = document.createElement('div');
  drawerContent.className = 'drawer-content flex flex-col';

  const drawerSide = document.createElement('div');
  drawerSide.className = 'drawer-side';
  drawerSide.style.zIndex = '40';
  drawerSide.style.overflow = 'visible';

  const overlay = document.createElement('label');
  overlay.htmlFor = 'klassenTakt-menu';
  overlay.className = 'drawer-overlay lg:hidden';

  const menu = document.createElement('div');
  menu.className = 'flex flex-col justify-between h-full bg-gray-100 text-gray-900 transition-all duration-200 ease-in-out shadow-inner';
  menu.style.position = 'relative';
  menu.style.zIndex = '30';

  const menuScroll = document.createElement('div');
  menuScroll.className = 'p-4 space-y-6 overflow-y-auto';
  menuScroll.style.overflowX = 'visible';

  const footer = document.createElement('div');
  footer.className = 'p-4 border-t border-gray-200 space-y-2 bg-white';

  menu.append(menuScroll, footer);

  drawerSide.append(overlay, menu);
  drawer.append(toggleInput, drawerContent, drawerSide);
  drawer.contentNode = drawerContent;
  drawer.toggleInput = toggleInput;

  const state = {
    active: (window.location.hash || '#/dashboard').split('?')[0],
    metrics: {},
    error: null,
    expanded: false,
    auth: getAuthState(),
  };

  const mediaQuery = window.matchMedia('(min-width: 1024px)');

  const progressBar = document.createElement('div');
  progressBar.className = 'w-full h-2 bg-gray-200 rounded-full overflow-hidden';
  const progressFill = document.createElement('div');
  progressFill.className = 'h-full w-0 bg-blue-500 transition-all';
  progressFill.dataset.progressFill = 'true';
  progressBar.appendChild(progressFill);

  const progressLabel = document.createElement('div');
  progressLabel.className = 'flex items-center justify-between text-xs text-gray-500';
  progressLabel.innerHTML = '<span>Setup-Fortschritt</span><span class="font-semibold text-gray-700">0/0</span>';
  progressLabel.dataset.progressLabel = 'true';

  footer.append(progressLabel, progressBar);

  const effectiveExpanded = () => (mediaQuery.matches ? state.expanded : true);

  function isExpandedForState() {
    if (mediaQuery.matches) {
      return state.expanded;
    }
    return toggleInput.checked;
  }

  function emitSidebarState() {
    document.dispatchEvent(
      new CustomEvent('sidebar-state', {
        detail: { expanded: isExpandedForState() },
      }),
    );
  }

  function applyLayoutState() {
    const expanded = effectiveExpanded();
    menu.style.width = mediaQuery.matches ? (expanded ? '18rem' : '5rem') : '18rem';
    menuScroll.querySelectorAll('[data-section-title]').forEach(el => {
      el.style.display = expanded ? 'block' : 'none';
    });
    menuScroll.querySelectorAll('[data-nav-label]').forEach(el => {
      el.style.display = expanded ? 'inline' : 'none';
    });
    menuScroll.querySelectorAll('[data-nav-status]').forEach(el => {
      el.style.display = expanded ? 'flex' : 'none';
    });
    menuScroll.querySelectorAll('[data-nav-label-wrap]').forEach(el => {
      el.style.justifyContent = expanded ? 'flex-start' : 'center';
      el.style.gap = expanded ? '0.75rem' : '0';
    });
    menuScroll.querySelectorAll('[data-nav-button]').forEach(el => {
      el.classList.toggle('justify-between', expanded);
      el.classList.toggle('justify-center', !expanded);
      el.style.textAlign = expanded ? 'left' : 'center';
      el.style.paddingLeft = expanded ? '0.75rem' : '0.5rem';
      el.style.paddingRight = expanded ? '0.75rem' : '0.5rem';
    });
    menuScroll.querySelectorAll('[data-nav-icon]').forEach(el => {
      el.style.margin = expanded ? '' : '0 auto';
    });
    progressLabel.style.display = expanded ? 'flex' : 'none';
    progressBar.style.display = expanded ? 'block' : 'none';
    emitSidebarState();
  }

  let metricsLoaded = false;

  async function loadMetrics() {
    if (!state.auth?.user || metricsLoaded) return;
    try {
      const [teachers, classes, subjects, rooms, curriculum, versions, basis, plans] = await Promise.all([
        fetchTeachers().catch(() => []),
        fetchClasses().catch(() => []),
        fetchSubjects().catch(() => []),
        fetchRooms().catch(() => []),
        fetchCurriculum().catch(() => []),
        fetchVersions().catch(() => []),
        fetchBasisplan().catch(() => null),
        fetchPlans().catch(() => []),
      ]);
      const periodSnapshot = getPlanningPeriodsSnapshot();
      const metrics = {
        teachers: metric(teachers.length),
        classes: metric(classes.length),
        subjects: metric(subjects.length),
        rooms: metric(rooms.length),
        curriculum: metric(curriculum.length),
        distribution: metric(versions.length),
        basisplan: metric(basis ? 1 : 0),
        plan: metric(versions.length),
        plans: metric(plans.length, plans.length ? 'ok' : 'idle'),
        periods: metric(periodSnapshot.periods.length, periodSnapshot.periods.length ? 'ok' : 'warn'),
        profile: metric(null, 'idle'),
        dashboard: metric(null, 'idle'),
        backup: metric(null, 'idle'),
      };
      state.metrics = metrics;
      state.error = null;
      metricsLoaded = true;
    } catch (err) {
      state.error = formatError(err);
    }
    renderMenu();
    updateProgress();
  }

  function metric(count, fallbackStatus = 'warn') {
    if (count == null) return { status: fallbackStatus, count: null };
    return {
      status: count > 0 ? 'ok' : 'warn',
      count,
    };
  }

  function updateProgress() {
    const total = SETUP_STEPS.length;
    const completed = SETUP_STEPS.filter(key => state.metrics[key]?.status === 'ok').length;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    const fill = progressBar.querySelector('[data-progress-fill]');
    if (fill) {
      fill.style.width = `${percent}%`;
    }
    progressLabel.querySelector('span:last-child').textContent = `${completed}/${total}`;
  }

  function renderMenu() {
    menuScroll.innerHTML = '';
    const user = state.auth?.user;
    NAV_SECTIONS.forEach(section => {
      if (section.title) {
        const title = document.createElement('p');
        title.className = 'text-xs uppercase tracking-wide text-gray-500 px-2';
        title.dataset.sectionTitle = 'true';
        title.textContent = section.title;
        menuScroll.appendChild(title);
      }
      section.items.forEach(item => {
        if (item.requiresAdmin && !user?.is_superuser) {
          return;
        }
        const isActive = state.active === item.hash.split('?')[0];

        const button = document.createElement('button');
        button.type = 'button';
        const buttonClasses = [
          'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition-colors duration-150 group text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
          'text-sm font-medium',
        ];
        if (isActive) {
          buttonClasses.push('bg-blue-50 border-blue-100 text-blue-700 shadow-sm');
        } else {
          buttonClasses.push('border-transparent text-gray-600 hover:bg-gray-100');
        }
        button.className = buttonClasses.join(' ');
        button.dataset.navButton = 'true';
        button.dataset.navLabelText = item.label;
        button.setAttribute('aria-label', item.label);

        const labelWrap = document.createElement('div');
        labelWrap.className = 'flex items-center gap-3 w-full';
        labelWrap.dataset.navLabelWrap = 'true';

        const iconWrap = document.createElement('div');
        const iconClasses = [
          'flex h-9 w-9 items-center justify-center rounded-lg border transition-colors duration-150',
        ];
        if (isActive) {
          iconClasses.push('bg-blue-600 border-blue-600 text-white shadow-sm');
        } else {
          iconClasses.push('bg-white border-gray-200 text-gray-500 group-hover:border-blue-200 group-hover:bg-blue-50 group-hover:text-blue-600');
        }
        iconWrap.className = iconClasses.join(' ');
        iconWrap.dataset.navIcon = 'true';
        const iconNode = createIcon(item.icon, { size: 18 });
        iconNode.style.width = '18px';
        iconNode.style.height = '18px';
        iconNode.setAttribute('aria-hidden', 'true');
        iconWrap.appendChild(iconNode);

        const text = document.createElement('span');
        text.textContent = item.label;
        text.dataset.navLabel = 'true';
        text.className = isActive ? 'truncate font-semibold' : 'truncate';

        labelWrap.append(iconWrap, text);
        button.appendChild(labelWrap);

        const statusWrap = document.createElement('div');
        statusWrap.className = 'flex items-center gap-2 text-xs text-gray-500';
        statusWrap.dataset.navStatus = 'true';
        const metricInfo = state.metrics[item.key];
        if (metricInfo) {
          if (metricInfo.count != null) {
            const countBadge = document.createElement('span');
            countBadge.className = 'inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700';
            countBadge.textContent = String(metricInfo.count);
            statusWrap.appendChild(countBadge);
          }
          const statusBadge = document.createElement('span');
          statusBadge.className = 'inline-flex items-center justify-center';
          if (metricInfo.status === 'ok') {
            statusBadge.classList.add('w-5', 'h-5', 'rounded-full', 'bg-green-100', 'text-green-600');
            const statusIcon = createIcon(ICONS.CHECK, { size: 12 });
            statusIcon.style.width = '12px';
            statusIcon.style.height = '12px';
            statusIcon.setAttribute('aria-hidden', 'true');
            statusBadge.appendChild(statusIcon);
          } else if (metricInfo.status === 'warn') {
            statusBadge.classList.add('w-5', 'h-5', 'rounded-full', 'bg-orange-100', 'text-orange-600');
            const statusIcon = createIcon(ICONS.ALERT_CIRCLE, { size: 12 });
            statusIcon.style.width = '12px';
            statusIcon.style.height = '12px';
            statusIcon.setAttribute('aria-hidden', 'true');
            statusBadge.appendChild(statusIcon);
          } else {
            statusBadge.classList.add('rounded-full', 'bg-gray-100', 'px-2', 'py-0.5', 'text-[10px]', 'font-semibold', 'text-gray-500');
            statusBadge.textContent = '•';
          }
          statusWrap.appendChild(statusBadge);
        }
        button.appendChild(statusWrap);

        button.addEventListener('click', event => {
          event.preventDefault();
          state.active = item.hash.split('?')[0];
          if (item.tab) {
            try {
              localStorage.setItem('maintenance-active-tab', item.tab);
            } catch {
              // ignore storage errors
            }
          }
          onNavigate(item.hash);
          toggleInput.checked = false;
          renderMenu();
        });

        button.title = item.label;

        menuScroll.appendChild(button);
      });
    });

    if (state.error) {
      const alert = document.createElement('div');
      alert.className = 'mt-4 rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs text-orange-700 shadow-sm';
      alert.textContent = state.error;
      menuScroll.appendChild(alert);
    }

    applyLayoutState();
  }

  function handleHashChange() {
    state.active = (window.location.hash || '#/dashboard').split('?')[0];
    renderMenu();
  }

  window.addEventListener('hashchange', handleHashChange);

  loadMetrics();
  renderMenu();
  applyLayoutState();
  const unsubscribeAuth = subscribeAuth(newAuth => {
    state.auth = newAuth;
    if (state.auth.user) {
      metricsLoaded = false;
      loadMetrics();
    }
    renderMenu();
  });

  function handleMediaChange() {
    if (!mediaQuery.matches) {
      state.expanded = false;
    }
    applyLayoutState();
  }

  function handleExternalToggle() {
    if (mediaQuery.matches) {
      state.expanded = !state.expanded;
      applyLayoutState();
    }
  }

  mediaQuery.addEventListener('change', handleMediaChange);
  document.addEventListener('sidebar-toggle', handleExternalToggle);
  toggleInput.addEventListener('change', emitSidebarState);

  drawer.destroy = () => {
    window.removeEventListener('hashchange', handleHashChange);
    mediaQuery.removeEventListener('change', handleMediaChange);
    document.removeEventListener('sidebar-toggle', handleExternalToggle);
    toggleInput.removeEventListener('change', emitSidebarState);
    unsubscribeAuth();
  };

  return drawer;
}
