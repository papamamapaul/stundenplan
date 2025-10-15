import { getView } from './views/index.js';

const DEFAULT_ROUTE = '#/plan/new';

export function initRouter(target) {
  const render = () => {
    const hash = window.location.hash || DEFAULT_ROUTE;
    const view = getView(hash);
    target.innerHTML = '';
    target.append(view);
  };

  window.addEventListener('hashchange', render);
  render();
}

export function navigateTo(hash) {
  if (window.location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
}
