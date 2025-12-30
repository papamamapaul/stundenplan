export function createSolverControls({ state, onParamChange }) {
  const container = document.createElement('div');
  container.className = 'space-y-3';

  function render() {
    container.innerHTML = '';
    state.paramInputs = new Map();

    const intro = document.createElement('p');
    intro.className = 'text-sm opacity-70';
    intro.textContent = 'Feintuning der OR-Tools-Suche – wirkt sich auf Laufzeit und Ergebnisqualität aus.';
    container.appendChild(intro);

    const grid = document.createElement('div');
    grid.className = 'grid gap-4 lg:grid-cols-2';

    const columnA = document.createElement('div');
    columnA.className = 'space-y-3';
    columnA.append(
      createParamRowCheckbox('Mehrfach-Start', 'Mehrere Startläufe mit unterschiedlichen Seeds', 'multi_start'),
      createParamRowNumber('Max. Versuche', 'Anzahl Startläufe (nur bei Mehrfach-Start)', 'max_attempts', { min: 1, max: 200, step: 1 }),
      createParamRowNumber('Geduld', 'Abbruch nach so vielen erfolglosen Läufen', 'patience', { min: 1, max: 50, step: 1 }),
      createParamRowNumber('Zeit pro Versuch (s)', 'Maximale Solver-Zeit pro Versuch', 'time_per_attempt', { min: 1, max: 600, step: 0.5 }),
    );

    const columnB = document.createElement('div');
    columnB.className = 'space-y-3';
    columnB.append(
      createParamRowCheckbox('Zufallssuche', 'Zufallsheuristiken aktivieren', 'randomize_search'),
      createParamRowNumber('Basis-Seed', 'Startwert für Zufallszahlen', 'base_seed', { step: 1 }),
      createParamRowNumber('Seed-Schritt', 'Offset für weitere Versuche', 'seed_step', { step: 1 }),
      createParamRowCheckbox('Value Hints', 'Startwerte für Slots vorgeben', 'use_value_hints'),
    );

    grid.append(columnA, columnB);
    container.appendChild(grid);
    sync();
  }

  function sync() {
    state.paramInputs.forEach((entry, key) => {
      const value = state.params[key];
      if (!entry || value === undefined) return;
      if (entry.type === 'checkbox') {
        entry.element.checked = !!value;
      } else if (entry.type === 'number') {
        entry.element.value = `${value}`;
      }
    });
  }

  function handleParamChange(key, value) {
    state.params[key] = value;
    if (typeof onParamChange === 'function') {
      onParamChange(key, value);
    }
    sync();
  }

  function createParamRowCheckbox(label, hint, key) {
    const wrapper = document.createElement('label');
    wrapper.className = 'flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm';

    const content = document.createElement('div');
    content.className = 'flex-1';
    const title = document.createElement('div');
    title.className = 'font-semibold text-gray-800';
    title.textContent = label;
    const subtitle = document.createElement('p');
    subtitle.className = 'text-xs text-gray-500';
    subtitle.textContent = hint;
    content.append(title, subtitle);

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'toggle toggle-primary toggle-sm';
    toggle.addEventListener('change', () => handleParamChange(key, toggle.checked));
    state.paramInputs.set(key, { type: 'checkbox', element: toggle });

    wrapper.append(content, toggle);
    return wrapper;
  }

  function createParamRowNumber(label, hint, key, opts = {}) {
    const { min = 0, max = 9999, step = 1 } = opts;
    const wrapper = document.createElement('div');
    wrapper.className = 'rounded-lg border border-gray-200 bg-white px-3 py-2 space-y-2';

    const labelWrap = document.createElement('div');
    labelWrap.className = 'flex items-center justify-between text-sm font-medium text-gray-800';
    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    const hintSpan = document.createElement('span');
    hintSpan.className = 'text-xs text-gray-500';
    hintSpan.textContent = hint;
    labelWrap.append(labelSpan, hintSpan);
    wrapper.appendChild(labelWrap);

    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.className = 'input input-sm input-bordered w-full';
    input.addEventListener('change', () => {
      let value = Number(input.value);
      if (Number.isNaN(value)) value = state.params[key];
      value = Math.max(min, Math.min(max, value));
      handleParamChange(key, value);
    });

    state.paramInputs.set(key, { type: 'number', element: input });
    wrapper.appendChild(input);
    return wrapper;
  }

  return {
    element: container,
    render,
    sync,
  };
}
