const LINK_CLASS = 'btn btn-ghost btn-sm';

export function createNavBar(onNavigate) {
  const nav = document.createElement('nav');
  nav.className = 'navbar bg-base-100 shadow sticky top-0 z-20 px-4 md:px-6';

  const start = document.createElement('div');
  start.className = 'flex items-center gap-3';
  const title = document.createElement('span');
  title.className = 'font-bold text-lg';
  title.textContent = '📚 KlassenTakt';
  start.append(title);

  const spacer = document.createElement('div');
  spacer.className = 'flex-1';

  const end = document.createElement('div');
  end.className = 'flex items-center gap-3';

  const prefs = document.createElement('button');
  prefs.type = 'button';
  prefs.className = LINK_CLASS;
  prefs.textContent = 'App Settings';
  prefs.addEventListener('click', () => onNavigate('#/einstellungen'));

  const actions = document.createElement('div');
  actions.className = 'join hidden sm:inline-flex';

  const loginBtn = document.createElement('button');
  loginBtn.className = 'btn btn-ghost join-item btn-sm';
  loginBtn.type = 'button';
  loginBtn.textContent = 'Login';

  const logoutBtn = document.createElement('button');
  logoutBtn.className = 'btn btn-ghost join-item btn-sm';
  logoutBtn.type = 'button';
  logoutBtn.textContent = 'Logout';

  const avatar = document.createElement('div');
  avatar.className = 'avatar placeholder';
  avatar.innerHTML = `
    <div class="bg-primary text-primary-content rounded-full w-9">
      <span>SL</span>
    </div>
  `;

  actions.append(loginBtn, logoutBtn);
  end.append(prefs, actions, avatar);

  nav.append(start, spacer, end);
  return nav;
}
