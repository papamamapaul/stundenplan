import {
  subscribePlanningPeriods,
  ensurePlanningPeriodsLoaded,
  setActivePlanningPeriodId,
  getActivePlanningPeriodId,
  getPlanningPeriodsSnapshot,
} from '../store/planningPeriods.js';
import { getAuthState, subscribeAuth, logout } from '../store/auth.js';

const LINK_CLASS = 'btn btn-ghost btn-sm';

export function createNavBar(onNavigate) {
  const nav = document.createElement('nav');
  nav.className = 'navbar bg-base-100 border-b border-base-200 sticky top-0 z-30 px-4 lg:px-6';

  const left = document.createElement('div');
  left.className = 'flex items-center gap-3';

  const toggleDrawerBtn = document.createElement('button');
  toggleDrawerBtn.type = 'button';
  toggleDrawerBtn.className = 'btn btn-ghost btn-circle';
  toggleDrawerBtn.setAttribute('aria-label', 'Navigation umschalten');
  toggleDrawerBtn.setAttribute('aria-expanded', 'false');
  toggleDrawerBtn.innerHTML = '<span class="text-xl">☰</span>';

  const brand = document.createElement('div');
  brand.className = 'flex items-center gap-2 font-semibold text-lg';
  const brandLogo = document.createElement('span');
  brandLogo.textContent = '📚';
  const brandName = document.createElement('span');
  brandName.textContent = 'KlassenTakt';
  brand.append(brandLogo, brandName);

  left.append(toggleDrawerBtn, brand);

  let sidebarExpanded = false;

  function updateToggleButtonState() {
    toggleDrawerBtn.setAttribute('aria-expanded', sidebarExpanded ? 'true' : 'false');
    toggleDrawerBtn.title = sidebarExpanded ? 'Menü schließen' : 'Menü öffnen';
    toggleDrawerBtn.innerHTML = `<span class="text-xl">${sidebarExpanded ? '✕' : '☰'}</span>`;
  }

  const handleSidebarState = event => {
    sidebarExpanded = Boolean(event.detail?.expanded);
    updateToggleButtonState();
  };

  document.addEventListener('sidebar-state', handleSidebarState);
  updateToggleButtonState();

  toggleDrawerBtn.addEventListener('click', () => {
    const drawerToggle = document.getElementById('klassenTakt-menu');
    if (drawerToggle) {
      drawerToggle.checked = !drawerToggle.checked;
      drawerToggle.dispatchEvent(new Event('change'));
    }
    document.dispatchEvent(new CustomEvent('sidebar-toggle'));
  });

  const center = document.createElement('div');
  center.className = 'flex-1 flex justify-center';

  const periodWrapper = document.createElement('div');
  periodWrapper.className = 'flex items-center gap-2 bg-base-200 rounded-full px-3 py-1 text-sm';
  const calendarIcon = document.createElement('span');
  calendarIcon.textContent = '🗓️';
  const periodSelect = document.createElement('select');
  periodSelect.className = 'bg-transparent focus:outline-none';
  periodWrapper.append(calendarIcon, periodSelect);
  center.append(periodWrapper);

  const right = document.createElement('div');
  right.className = 'flex items-center gap-4';

  const periodLabel = document.createElement('span');
  periodLabel.className = 'hidden lg:inline text-sm opacity-60';
  periodLabel.textContent = 'Planungsperiode';

  periodSelect.addEventListener('change', () => {
    const selected = periodSelect.value ? Number(periodSelect.value) : null;
    setActivePlanningPeriodId(selected);
    const selectedOption = periodSelect.options[periodSelect.selectedIndex];
    periodLabel.textContent = selectedOption ? selectedOption.textContent : 'Planungsperiode';
    const currentRoute = window.location.hash || '#/plan/new';
    onNavigate(currentRoute);
  });

  const settingsBtn = document.createElement('button');
  settingsBtn.type = 'button';
  settingsBtn.className = LINK_CLASS;
  settingsBtn.textContent = 'Einstellungen';
  settingsBtn.addEventListener('click', () => onNavigate('#/einstellungen'));

  const userCard = document.createElement('div');
  userCard.className = 'flex items-center gap-2';

  const userInfo = document.createElement('div');
  userInfo.className = 'hidden sm:flex flex-col text-right text-sm';
  const userName = document.createElement('span');
  userName.className = 'font-semibold';
  userName.textContent = 'Gast';
  const userRole = document.createElement('span');
  userRole.className = 'opacity-60 text-xs';
  userRole.textContent = 'Bitte anmelden';
  userInfo.append(userName, userRole);

  const avatar = document.createElement('div');
  avatar.className = 'avatar placeholder';
  const avatarCircle = document.createElement('div');
  avatarCircle.className = 'bg-primary text-primary-content rounded-full w-10 flex items-center justify-center';
  avatarCircle.innerHTML = '<span>??</span>';
  avatar.appendChild(avatarCircle);

  userCard.append(userInfo, avatar);

  const logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.className = LINK_CLASS;
  logoutBtn.textContent = 'Logout';
  logoutBtn.addEventListener('click', () => logout());
  logoutBtn.classList.add('hidden');

  right.append(periodLabel, settingsBtn, userCard, logoutBtn);

  nav.append(left, center, right);

  const unsubscribe = subscribePlanningPeriods(({ periods, activeId }) => {
    renderPeriodOptions(periods, activeId);
  });

  const authState = getAuthState();
  updateUserCard(authState);
  const unsubscribeAuth = subscribeAuth(newState => {
    updateUserCard(newState);
    if (newState.user) {
      ensurePlanningPeriodsLoaded().catch(err => {
        console.error('Planungsperioden konnten nicht geladen werden:', err); // eslint-disable-line no-console
      });
    }
  });

  function renderPeriodOptions(periods, activeId) {
    periodSelect.innerHTML = '';
    if (!periods.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Keine Planungsperiode';
      periodSelect.appendChild(option);
      periodSelect.disabled = true;
      periodLabel.textContent = 'Keine Planungsperiode';
      return;
    }
    periods.forEach(period => {
      const option = document.createElement('option');
      option.value = period.id;
      option.textContent = period.name;
      if (period.is_active) option.textContent += ' (aktiv)';
      periodSelect.appendChild(option);
    });
    periodSelect.disabled = false;
    const currentId = activeId ?? getActivePlanningPeriodId();
    if (currentId != null) {
      periodSelect.value = String(currentId);
    } else {
      periodSelect.selectedIndex = 0;
      const selectedOption = periodSelect.options[periodSelect.selectedIndex];
      if (selectedOption) {
        setActivePlanningPeriodId(Number(selectedOption.value));
      }
    }
    const selectedOption = periodSelect.options[periodSelect.selectedIndex];
    periodLabel.textContent = selectedOption ? selectedOption.textContent : 'Planungsperiode';
  }

  // Initialize with current snapshot to avoid delay until first subscription callback
  const snapshot = getPlanningPeriodsSnapshot();
  renderPeriodOptions(snapshot.periods, snapshot.activeId);

  nav.destroy = () => {
    unsubscribe();
    unsubscribeAuth();
    document.removeEventListener('sidebar-state', handleSidebarState);
  };
  nav.setAuthMode = function setAuthMode(isAuthMode) {
    toggleDrawerBtn.style.display = isAuthMode ? 'none' : '';
    center.style.display = isAuthMode ? 'none' : '';
    right.style.display = isAuthMode ? 'none' : '';
    nav.classList.toggle('justify-center', isAuthMode);
    nav.classList.toggle('py-6', isAuthMode);
    nav.classList.toggle('border-b', !isAuthMode);
  };
  return nav;

  function updateUserCard(auth) {
    const user = auth.user;
    const hasUser = Boolean(user);
    settingsBtn.disabled = !hasUser;
    if (!hasUser) {
      userName.textContent = 'Gast';
      userRole.textContent = 'Bitte anmelden';
      avatarCircle.innerHTML = '<span>??</span>';
      logoutBtn.classList.add('hidden');
      return;
    }
    userName.textContent = user.full_name || user.email;
    userRole.textContent = user.is_superuser ? 'Administrator' : 'Lehrkraft';
    const initials = computeInitials(user.full_name || user.email);
    avatarCircle.innerHTML = `<span>${initials}</span>`;
    logoutBtn.classList.remove('hidden');
  }
}

function computeInitials(value = '') {
  const parts = value.trim().split(/[\s@]/).filter(Boolean);
  if (!parts.length) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
