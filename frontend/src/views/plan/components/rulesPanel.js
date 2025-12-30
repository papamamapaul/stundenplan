export function createRulesPanel({
  state,
  ruleGroups,
  ruleExtras,
  onRulesChanged,
  onDebugStale,
}) {
  const container = document.createElement('div');
  container.className = 'space-y-3';

  function render() {
    state.boolInputs.clear();
    state.weightInputs.clear();
    state.ruleExtraContainers.clear();
    state.ruleGroupSections = new Map();
    if (!state.rulesDefinition) {
      container.innerHTML = '<p class="text-sm opacity-70">Keine Regeln geladen.</p>';
      return;
    }

    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'space-y-3';

    ruleGroups.forEach(group => {
      const availableKeys = group.keys.filter(key => state.ruleDefinitionByKey.has(key));
      if (!availableKeys.length) return;

      const card = document.createElement('article');
      card.className = 'rounded-lg border border-gray-200 bg-white overflow-hidden';

      const headerButton = document.createElement('button');
      headerButton.type = 'button';
      headerButton.className = 'flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-gray-100 focus:outline-none';

      const headerContent = document.createElement('div');
      headerContent.className = 'space-y-0.5';
      const heading = document.createElement('h3');
      heading.className = 'text-xs font-semibold uppercase tracking-wide text-gray-600';
      heading.textContent = group.label;
      headerContent.appendChild(heading);
      if (group.description) {
        const desc = document.createElement('p');
        desc.className = 'text-xs text-gray-500';
        desc.textContent = group.description;
        headerContent.appendChild(desc);
      }

      const chevron = document.createElement('span');
      chevron.className = 'text-sm text-gray-400 transition-transform duration-200';
      chevron.textContent = '▾';

      headerButton.append(headerContent, chevron);
      card.appendChild(headerButton);

      const list = document.createElement('div');
      list.className = 'space-y-2.5';
      availableKeys.forEach(key => {
        const entry = createRuleEntry(key, headerButton);
        if (entry) list.appendChild(entry);
      });
      if (!list.childElementCount) return;

      const content = document.createElement('div');
      content.className = 'px-3 pb-3 space-y-3 border-t border-gray-100 bg-white';
      content.appendChild(list);
      card.appendChild(content);

      const entryRecord = {
        button: headerButton,
        content,
        chevron,
        collapsed: false,
      };
      state.ruleGroupSections.set(group.id, entryRecord);

      headerButton.addEventListener('click', () => {
        toggleGroup(group.id);
      });

      const initialCollapsed = state.ruleGroupCollapsed.get(group.id) ?? false;
      setGroupCollapsed(group.id, initialCollapsed, { suppressStore: true });

      grid.appendChild(card);
    });

    if (!grid.childElementCount) {
      const note = document.createElement('p');
      note.className = 'text-sm opacity-70';
      note.textContent = 'Keine Regeln verfügbar.';
      container.appendChild(note);
    } else {
      container.appendChild(grid);
    }

    syncInputs();
  }

  function syncInputs() {
    state.boolInputs.forEach((input, key) => {
      const value = state.ruleValuesBools.get(key);
      const fallback = state.ruleBackendDefaultsBools.get(key);
      input.checked = value !== undefined ? !!value : !!fallback;
      updateExtraContainerState(key, input.checked);
    });
    state.weightInputs.forEach((entry, key) => {
      const value = state.ruleValuesWeights.get(key);
      const fallback = state.ruleBackendDefaultsWeights.get(key) ?? 0;
      const resolved = value !== undefined ? value : fallback;
      entry.range.value = String(resolved);
      entry.number.value = String(resolved);
      if (entry.valueLabel) entry.valueLabel.textContent = String(resolved);
    });
  }

  function createRuleEntry(ruleKey, parentHeaderButton) {
    const ruleDef = state.ruleDefinitionByKey.get(ruleKey);
    if (!ruleDef) return null;

    const wrapper = document.createElement('article');
    wrapper.className = 'rounded-md border border-gray-100 bg-gray-50 px-3 py-2 space-y-2';

    if (ruleDef.type === 'bool') {
      const header = document.createElement('div');
      header.className = 'flex items-start justify-between gap-3';
      const textWrap = document.createElement('div');
      textWrap.className = 'space-y-0.5';
      const title = document.createElement('span');
      title.className = 'text-sm font-medium text-gray-900';
      title.textContent = ruleDef.label || ruleKey;
      if (ruleDef.info) {
        title.title = ruleDef.info;
        header.title = ruleDef.info;
        if (parentHeaderButton) parentHeaderButton.title = ruleDef.info;
      }
      textWrap.appendChild(title);

      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.className = 'toggle toggle-sm toggle-primary';
      toggle.dataset.ruleKey = ruleKey;
      toggle.addEventListener('change', () => {
        state.ruleValuesBools.set(ruleKey, toggle.checked);
        updateExtraContainerState(ruleKey, toggle.checked);
        if (typeof onRulesChanged === 'function') onRulesChanged();
        if (typeof onDebugStale === 'function') onDebugStale();
      });

      header.append(textWrap, toggle);
      wrapper.appendChild(header);
      state.boolInputs.set(ruleKey, toggle);

      const extraKeys = ruleExtras[ruleKey] || [];
      if (extraKeys.length) {
        const extras = document.createElement('div');
        extras.className = 'space-y-2 border-l border-gray-200 pl-3';
        extraKeys.forEach(weightKey => {
          const control = createInlineWeightControl(weightKey);
          if (control) extras.appendChild(control);
        });
        if (extras.childElementCount) {
          wrapper.appendChild(extras);
          state.ruleExtraContainers.set(ruleKey, extras);
        }
      }
    } else {
      const control = createInlineWeightControl(ruleKey);
      if (control) wrapper.appendChild(control);
    }

    return wrapper.childElementCount ? wrapper : null;
  }

  function createInlineWeightControl(weightKey) {
    const weightDef = state.ruleDefinitionByKey.get(weightKey);
    if (!weightDef) return null;

    const block = document.createElement('div');
    block.className = 'space-y-1';

    const labelRow = document.createElement('div');
    labelRow.className = 'flex items-center justify-between text-xs font-medium text-gray-600';
    const labelText = document.createElement('span');
    labelText.textContent = weightDef.label || weightKey;
    const valueLabel = document.createElement('span');
    valueLabel.className = 'text-xs text-gray-500';
    labelRow.append(labelText, valueLabel);
    if (weightDef.info) {
      labelRow.title = weightDef.info;
      labelText.title = weightDef.info;
      valueLabel.title = weightDef.info;
    }

    const controls = document.createElement('div');
    controls.className = 'flex items-center gap-2 text-xs';

    const min = weightDef.min ?? 0;
    const max = weightDef.max ?? 50;

    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'range range-primary range-xs flex-1';
    range.min = String(min);
    range.max = String(max);
    range.step = 1;

    const number = document.createElement('input');
    number.type = 'number';
    number.className = 'input input-xs input-bordered w-16';
    number.min = String(min);
    number.max = String(max);
    number.step = '1';

    const applyValue = value => {
      state.ruleValuesWeights.set(weightKey, value);
      range.value = String(value);
      number.value = String(value);
      valueLabel.textContent = String(value);
      if (typeof onRulesChanged === 'function') onRulesChanged();
      if (typeof onDebugStale === 'function') onDebugStale();
    };

    range.addEventListener('input', () => applyValue(Number(range.value)));
    number.addEventListener('change', () => {
      let value = Number(number.value);
      if (Number.isNaN(value)) value = state.ruleValuesWeights.get(weightKey) ?? weightDef.default ?? min;
      value = Math.max(min, Math.min(max, value));
      applyValue(value);
    });

    controls.append(range, number);
    block.append(labelRow, controls);
    state.weightInputs.set(weightKey, { range, number, valueLabel });
    return block;
  }

  function updateExtraContainerState(ruleKey, enabled) {
    const container = state.ruleExtraContainers.get(ruleKey);
    if (!container) return;
    if (enabled) {
      container.classList.remove('opacity-40', 'pointer-events-none');
    } else {
      container.classList.add('opacity-40', 'pointer-events-none');
    }
  }

  function setGroupCollapsed(groupId, collapsed, options = {}) {
    const entry = state.ruleGroupSections.get(groupId);
    if (!entry) return;
    const { suppressStore = false } = options;
    entry.collapsed = collapsed;
    entry.content.classList.toggle('hidden', collapsed);
    entry.chevron.style.transform = collapsed ? 'rotate(180deg)' : 'rotate(0deg)';
    if (!suppressStore) {
      state.ruleGroupCollapsed.set(groupId, collapsed);
    }
  }

  function toggleGroup(groupId) {
    const entry = state.ruleGroupSections.get(groupId);
    if (!entry) return;
    setGroupCollapsed(groupId, !entry.collapsed);
  }

  function collapseAll() {
    state.ruleGroupSections.forEach((_entry, key) => {
      setGroupCollapsed(key, true);
    });
  }

  return {
    element: container,
    render,
    syncInputs,
    collapseAll,
  };
}
