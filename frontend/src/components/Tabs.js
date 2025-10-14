export function createTabs(items) {
  const nav = document.createElement('div');
  nav.className = 'tabs tabs-boxed w-fit';

  let activeId = items[0]?.id ?? null;
  const listeners = new Set();

  const buttons = items.map(item => {
    const btn = document.createElement('a');
    btn.className = 'tab';
    btn.textContent = item.label;
    btn.dataset.tabId = item.id;
    btn.addEventListener('click', () => {
      if (activeId === item.id) return;
      activeId = item.id;
      updateActive();
      listeners.forEach(listener => listener(activeId));
    });
    nav.appendChild(btn);
    return btn;
  });

  function updateActive() {
    buttons.forEach(btn => {
      btn.classList.toggle('tab-active', btn.dataset.tabId === activeId);
    });
  }

  updateActive();

  return {
    nav,
    get active() {
      return activeId;
    },
    setActive(id) {
      if (items.some(item => item.id === id)) {
        activeId = id;
        updateActive();
        listeners.forEach(listener => listener(activeId));
      }
    },
    onChange(listener) {
      listeners.add(listener);
    },
  };
}
