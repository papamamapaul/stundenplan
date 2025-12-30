import { getActivePlanningPeriod } from '../../../store/planningPeriods.js';

const VIEW_ACTIVE_CLASS = 'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors bg-blue-100 text-blue-700 shadow-sm';
const VIEW_INACTIVE_CLASS = 'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors text-gray-600 hover:text-gray-900';

export function createPlanToolbar(tabs) {
  const element = document.createElement('div');
  element.className = 'bg-white border-b border-gray-200 px-6 py-4';
  const inner = document.createElement('div');
  inner.className = 'flex flex-wrap items-center justify-between gap-4';
  element.appendChild(inner);

  const left = document.createElement('div');
  left.className = 'space-y-1';
  const titleEl = document.createElement('h2');
  titleEl.className = 'text-xl font-semibold text-gray-900';
  titleEl.textContent = 'Planberechnung';
  const subtitleEl = document.createElement('p');
  subtitleEl.className = 'text-sm text-gray-600';
  subtitleEl.textContent = 'Stundenverteilung: —';
  const metaEl = document.createElement('p');
  metaEl.className = 'text-xs text-gray-400';
  metaEl.textContent = 'Planungsperiode: —';
  const statusLineEl = document.createElement('p');
  statusLineEl.className = 'text-xs text-gray-500';
  statusLineEl.textContent = 'Status: —';
  left.append(titleEl, subtitleEl, metaEl, statusLineEl);
  inner.appendChild(left);

  const right = document.createElement('div');
  right.className = 'flex flex-wrap items-center justify-end gap-3';

  const viewSegment = document.createElement('div');
  viewSegment.className = 'flex items-center gap-2 rounded-lg bg-gray-100 p-1';
  right.appendChild(viewSegment);

  const viewButtons = {};

  function buildViewButton(id, label, iconSvg) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = VIEW_INACTIVE_CLASS;
    btn.dataset.viewId = id;
    const iconWrap = document.createElement('span');
    iconWrap.className = 'inline-flex h-4 w-4 items-center justify-center text-gray-400';
    iconWrap.innerHTML = iconSvg;
    const textSpan = document.createElement('span');
    textSpan.textContent = label;
    btn.append(iconWrap, textSpan);
    btn.addEventListener('click', () => {
      if (tabs.active !== id) {
        tabs.setActive(id);
      }
    });
    viewButtons[id] = { button: btn, icon: iconWrap };
    viewSegment.appendChild(btn);
  }

  buildViewButton(
    'results',
    'Plan',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M3 3h18"></path><path d="M3 9h18"></path><path d="M3 15h18"></path><path d="M3 21h18"></path></svg>',
  );
  buildViewButton(
    'analysis',
    'Analyse',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="m3 3 6 6"></path><path d="M9 3 3 9"></path><path d="M13 16h-1v-4h1"></path><path d="M17 16h-1v-6h1"></path><path d="M21 16h-1V8h1"></path></svg>',
  );

  const statusChip = document.createElement('div');
  statusChip.className = 'flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm text-gray-600 shadow-sm';
  const statusIcon = document.createElement('span');
  statusIcon.className = 'inline-flex h-4 w-4 items-center justify-center text-gray-400';
  statusIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
  const metricLabelEl = document.createElement('span');
  metricLabelEl.textContent = 'Slots:';
  const metricValueEl = document.createElement('span');
  metricValueEl.className = 'font-semibold text-blue-600';
  metricValueEl.textContent = '—';
  statusChip.append(statusIcon, metricLabelEl, metricValueEl);
  right.appendChild(statusChip);

  const primaryButton = document.createElement('button');
  primaryButton.type = 'button';
  primaryButton.className = 'inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-60 disabled:pointer-events-none';
  const primaryIcon = document.createElement('span');
  primaryIcon.className = 'inline-flex h-4 w-4 items-center justify-center text-white';
  primaryIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
  const primaryLabelEl = document.createElement('span');
  primaryLabelEl.textContent = 'Plan berechnen';
  primaryButton.append(primaryIcon, primaryLabelEl);
  right.appendChild(primaryButton);

  inner.appendChild(right);

  function setActiveTab(id) {
    Object.entries(viewButtons).forEach(([viewId, entry]) => {
      const active = viewId === id;
      entry.button.className = active ? VIEW_ACTIVE_CLASS : VIEW_INACTIVE_CLASS;
      entry.icon.className = `inline-flex h-4 w-4 items-center justify-center ${active ? 'text-blue-600' : 'text-gray-400'}`;
    });
  }

  setActiveTab(tabs.active);

  return {
    element,
    titleEl,
    subtitleEl,
    metaEl,
    statusLineEl,
    metricLabelEl,
    metricValueEl,
    primaryButton,
    primaryLabelEl,
    setActiveTab,
  };
}

export function updatePlanToolbar(toolbar, state) {
  if (!toolbar) return;

  const latestPlan = state.generatedPlans[0] || null;
  toolbar.titleEl.textContent = latestPlan?.name || 'Planberechnung';

  const versionName = state.selectedVersionId
    ? state.versions.find(v => v.id === state.selectedVersionId)?.name || `Version #${state.selectedVersionId}`
    : null;
  toolbar.subtitleEl.textContent = versionName
    ? `Stundenverteilung: ${versionName}`
    : 'Stundenverteilung: Bitte auswählen';

  const activePeriod = getActivePlanningPeriod();
  toolbar.metaEl.textContent = `Planungsperiode: ${activePeriod?.name ?? '—'}`;

  let statusText;
  if (state.generating) {
    statusText = 'Berechnung läuft…';
  } else if (latestPlan) {
    statusText = latestPlan.status || 'Plan erstellt';
  } else {
    statusText = 'Bereit zur Berechnung';
  }
  toolbar.statusLineEl.textContent = `Status: ${statusText}`;

  if (latestPlan?.score != null) {
    toolbar.metricLabelEl.textContent = 'Score:';
    toolbar.metricValueEl.textContent = latestPlan.score.toFixed(2);
  } else if (latestPlan) {
    const slotCount = Array.isArray(latestPlan.slots) ? latestPlan.slots.length : 0;
    toolbar.metricLabelEl.textContent = 'Slots:';
    toolbar.metricValueEl.textContent = `${slotCount}`;
  } else {
    toolbar.metricLabelEl.textContent = 'Slots:';
    toolbar.metricValueEl.textContent = '—';
  }

  const disabled = state.generating || !state.selectedVersionId;
  toolbar.primaryButton.disabled = disabled;
  toolbar.primaryButton.classList.toggle('cursor-not-allowed', disabled);
  toolbar.primaryButton.title = disabled && !state.selectedVersionId
    ? 'Bitte zuerst eine Stundenverteilung auswählen.'
    : '';
}
