import { getView } from './views/index.js';
import { getAuthState, subscribeAuth } from './store/auth.js';

const DEFAULT_ROUTE = '#/plan/new';

export function initRouter(target) {
  const render = () => {
    const auth = getAuthState();
    if (auth.loading) {
      target.innerHTML = '<div class="p-10 text-center text-sm opacity-60">Lade…</div>';
      return;
    }
    const hash = window.location.hash || DEFAULT_ROUTE;
    const baseHash = hash.split('?')[0];
    document.dispatchEvent(new CustomEvent('route-change', { detail: { route: baseHash } }));
    if (!auth.user && baseHash !== '#/login') {
      window.location.hash = '#/login';
      return;
    }
    if (auth.user && baseHash === '#/login') {
      window.location.hash = DEFAULT_ROUTE;
      return;
    }
    const view = getView(baseHash, hash);
    target.innerHTML = '';
    target.append(view);
  };

  window.addEventListener('hashchange', render);
  const unsubscribe = subscribeAuth(() => render());
  render();

  return () => {
    window.removeEventListener('hashchange', render);
    unsubscribe();
  };
}

export function navigateTo(hash) {
  if (window.location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
}
