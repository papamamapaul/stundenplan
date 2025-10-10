const NAVIGATION = [
  {
    group: 'Planung',
    items: [
      { label: 'Dashboard', hash: '#/plan' },
      { label: 'Basisplan', hash: '#/basisplan' },
      { label: 'Stundenverteilung', hash: '#/stundenverteilung' },
    ],
  },
  {
    group: 'Stammdaten',
    items: [
      { label: 'Datenpflege', hash: '#/datenpflege' },
    ],
  },
];

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

  const overlay = document.createElement('label');
  overlay.htmlFor = 'klassenTakt-menu';
  overlay.className = 'drawer-overlay lg:hidden';

  const menu = document.createElement('ul');
  menu.className = 'menu p-4 w-72 min-h-full bg-base-200 text-base-content gap-4';

  NAVIGATION.forEach(section => {
    const groupTitle = document.createElement('li');
    groupTitle.className = 'menu-title';
    groupTitle.textContent = section.group;
    menu.appendChild(groupTitle);

    section.items.forEach(item => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = item.hash;
      link.textContent = item.label;
      link.className = 'rounded-lg';
      link.addEventListener('click', (event) => {
        event.preventDefault();
        onNavigate(item.hash);
        toggleInput.checked = false;
      });
      li.appendChild(link);
      menu.appendChild(li);
    });
  });

  drawerSide.append(overlay, menu);
  drawer.append(toggleInput, drawerContent, drawerSide);
  drawer.contentNode = drawerContent;
  drawer.toggleInput = toggleInput;
  return drawer;
}
