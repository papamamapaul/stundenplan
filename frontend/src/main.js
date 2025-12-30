import { initRouter, navigateTo } from './router.js';
import { createNavBar } from './components/NavBar.js';
import { createSidebar } from './components/Sidebar.js';
import { createFooter } from './components/Footer.js';
import { registerView } from './views/index.js';
import { ensurePlanningPeriodsLoaded } from './store/planningPeriods.js';
import { initAuth, getAuthState, subscribeAuth } from './store/auth.js';

const THEME_KEY = 'app-theme';

function applyPersistedTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  const theme = stored || 'light';
  document.documentElement.setAttribute('data-theme', theme);
}

document.addEventListener('DOMContentLoaded', async () => {
  applyPersistedTheme();
  await initAuth();
  const app = document.getElementById('app');
  if (!app) {
    console.error('Root container #app missing');
    return;
  }

  const nav = createNavBar(navigateTo);

  const layout = document.createElement('div');
  layout.className = 'flex flex-1 w-full';

  const sidebar = createSidebar(navigateTo);
  const contentContainer = sidebar.contentNode;
  contentContainer.classList.add('w-full');

  const content = document.createElement('main');
  content.id = 'app-content';
  content.className = 'p-6 lg:p-8 max-w-[1400px] mx-auto w-full';
  contentContainer.appendChild(content);

  layout.append(sidebar);

  app.innerHTML = '';
  const footer = createFooter();
  app.append(nav, layout, footer);

  const updateAuthLayout = route => {
    const normalized = route || (window.location.hash ? window.location.hash.split('?')[0] : '');
    const isAuthMode = normalized === '#/login';
    document.body.classList.toggle('auth-mode', isAuthMode);
    if (typeof nav.setAuthMode === 'function') {
      nav.setAuthMode(isAuthMode);
    }
  };

  const routeListener = event => {
    updateAuthLayout(event.detail?.route);
  };
  document.addEventListener('route-change', routeListener);
  updateAuthLayout(window.location.hash);

  initRouter(content);
  const loadPeriodsIfReady = () => {
    const auth = getAuthState();
    if (!auth.user) return;
    ensurePlanningPeriodsLoaded().catch(err => {
      console.error('Planungsperioden konnten nicht geladen werden:', err); // eslint-disable-line no-console
    });
  };
  subscribeAuth(loadPeriodsIfReady);
  loadPeriodsIfReady();
});

export { applyPersistedTheme };
