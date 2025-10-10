import { initRouter, navigateTo } from './router.js';
import { createNavBar } from './components/NavBar.js';
import { createSidebar } from './components/Sidebar.js';
import { createFooter } from './components/Footer.js';
import { registerView } from './views/index.js';

const THEME_KEY = 'app-theme';

function applyPersistedTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  const theme = stored || 'light';
  document.documentElement.setAttribute('data-theme', theme);
}

document.addEventListener('DOMContentLoaded', () => {
  applyPersistedTheme();
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

  initRouter(content);
});

export { applyPersistedTheme };
