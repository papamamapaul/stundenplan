import { fetchPlans, deletePlan as deletePlanApi } from '../api/plans.js';
import { navigateTo } from '../router.js';
import { formatError } from '../utils/ui.js';
import { getActivePlanningPeriod } from '../store/planningPeriods.js';

export function createPlanArchiveView() {
  const container = document.createElement('section');
  container.className = 'space-y-6';

  const header = document.createElement('div');
  header.className = 'space-y-1';
  header.innerHTML = `
    <h1 class="text-2xl font-semibold">Pläne ansehen</h1>
    <p class="text-sm opacity-70">Greife auf bereits erzeugte Pläne zu, vergleiche Varianten und öffne sie im Editor.</p>
  `;

  const periodInfo = document.createElement('p');
  periodInfo.className = 'text-xs opacity-60';
  const activePeriod = getActivePlanningPeriod();
  periodInfo.textContent = activePeriod
    ? `Aktive Planungsperiode: ${activePeriod.name}`
    : 'Keine Planungsperiode ausgewählt.';
  header.appendChild(periodInfo);

  const statusBar = createStatusBar();

  const layout = document.createElement('div');
  layout.className = 'grid gap-6 xl:grid-cols-[minmax(300px,340px)_1fr]';

  const listCard = document.createElement('article');
  listCard.className = 'card bg-base-100 border border-base-200 shadow-sm';
  const listBody = document.createElement('div');
  listBody.className = 'card-body space-y-4';
  const listTitle = document.createElement('h2');
  listTitle.className = 'card-title text-lg';
  listTitle.textContent = 'Planvarianten';
  listBody.appendChild(listTitle);

  const listTable = document.createElement('table');
  listTable.className = 'table table-zebra table-compact';
  listTable.innerHTML = `
    <thead>
      <tr>
        <th>Name</th>
        <th>Status</th>
        <th>Score</th>
        <th>Version</th>
        <th>Erstellt</th>
        <th></th>
      </tr>
    </thead>
  `;
  const listTableBody = document.createElement('tbody');
  listTable.appendChild(listTableBody);
  listBody.appendChild(listTable);
  listCard.appendChild(listBody);

  const detailCard = document.createElement('article');
  detailCard.className = 'card bg-base-100 border border-base-200 shadow-sm';
  const detailBody = document.createElement('div');
  detailBody.className = 'card-body space-y-3';
  detailBody.innerHTML = `
    <h2 class="card-title text-lg">Plan im Editor öffnen</h2>
    <p class="text-sm opacity-70">Wähle in der Liste links eine Planvariante aus und klicke auf <strong>„Im Editor öffnen“</strong>, um sie in der Planansicht zu betrachten.</p>
    <p class="text-xs opacity-60">Von dort kannst du Regeln anpassen, neu berechnen oder den Plan unter einem neuen Namen speichern.</p>
  `;
  detailCard.appendChild(detailBody);

  layout.append(listCard, detailCard);
  container.append(header, statusBar.element, layout);

  const state = {
    loading: false,
    plans: [],
    deleting: new Set(),
    selectedPlanId: null,
  };

  initialize().catch(err => {
    statusBar.set(`Fehler beim Laden: ${formatError(err)}`, true);
  });

  function initialize() {
    statusBar.set('Lade Pläne…');
    state.loading = true;
    return fetchPlans()
      .then(plans => {
        state.plans = Array.isArray(plans) ? plans : [];
        renderPlanList();
        statusBar.set(`${state.plans.length} Plan${state.plans.length === 1 ? '' : 'e'} geladen.`);
        setTimeout(statusBar.clear, 1500);
      })
      .catch(err => {
        statusBar.set(`Fehler beim Laden: ${formatError(err)}`, true);
      })
      .finally(() => {
        state.loading = false;
      });
  }

  function renderPlanList() {
    listTableBody.innerHTML = '';
    if (!state.plans.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.className = 'text-sm opacity-70 py-6 text-center';
      cell.textContent = state.loading ? 'Lade…' : 'Noch keine Pläne gespeichert.';
      row.appendChild(cell);
      listTableBody.appendChild(row);
      return;
    }

    state.plans.forEach(plan => {
      const tr = document.createElement('tr');
      if (plan.id === state.selectedPlanId) tr.classList.add('active');

      const nameTd = document.createElement('td');
      nameTd.textContent = plan.name || `Plan #${plan.id}`;
      tr.appendChild(nameTd);

      const statusTd = document.createElement('td');
      statusTd.textContent = plan.status || '-';
      tr.appendChild(statusTd);

      const scoreTd = document.createElement('td');
      scoreTd.textContent = plan.score != null ? plan.score.toFixed(2) : '—';
      tr.appendChild(scoreTd);

      const versionTd = document.createElement('td');
      versionTd.textContent = plan.version_id != null ? `#${plan.version_id}` : '—';
      tr.appendChild(versionTd);

      const createdTd = document.createElement('td');
      createdTd.textContent = formatDate(plan.created_at);
      tr.appendChild(createdTd);

      const actionTd = document.createElement('td');
      actionTd.className = 'flex items-center justify-end gap-2';

      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'btn btn-xs btn-outline';
      openBtn.textContent = 'Im Editor öffnen';
      openBtn.disabled = state.deleting.has(plan.id);
      openBtn.addEventListener('click', () => {
        state.selectedPlanId = plan.id;
        renderPlanList();
        navigateTo(`#/plan/${plan.id}`);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-xs btn-outline btn-error';
      deleteBtn.textContent = 'Löschen';
      deleteBtn.disabled = state.deleting.has(plan.id);
      deleteBtn.addEventListener('click', () => confirmDelete(plan.id));

      actionTd.append(openBtn, deleteBtn);
      tr.appendChild(actionTd);

      listTableBody.appendChild(tr);
    });
  }

  async function confirmDelete(planId) {
    const plan = state.plans.find(entry => entry.id === planId);
    const name = plan?.name || `Plan #${planId}`;
    const confirmed = window.confirm(`Plan "${name}" wirklich löschen?`);
    if (!confirmed) return;
    await deletePlan(planId);
  }

  async function deletePlan(planId) {
    state.deleting.add(planId);
    renderPlanList();
    try {
      await deletePlanApi(planId);
      state.plans = state.plans.filter(plan => plan.id !== planId);
      state.deleting.delete(planId);
      if (state.selectedPlanId === planId) {
        state.selectedPlanId = null;
      }
      renderPlanList();
      statusBar.set('Plan gelöscht.');
      setTimeout(statusBar.clear, 1500);
    } catch (err) {
      state.deleting.delete(planId);
      renderPlanList();
      statusBar.set(`Löschen fehlgeschlagen: ${formatError(err)}`, true);
    }
  }

  return container;
}

function formatDate(value) {
  if (!value) return '—';
  try {
    const date = new Date(value);
    return date.toLocaleString();
  } catch (err) {
    return String(value);
  }
}

function createStatusBar() {
  const element = document.createElement('div');
  element.className = 'text-sm opacity-70 min-h-[1.5rem]';
  return {
    element,
    set(message, error = false) {
      element.textContent = message || '';
      element.className = `text-sm ${error ? 'text-error' : 'text-success'} min-h-[1.5rem]`;
    },
    clear() {
      element.textContent = '';
      element.className = 'text-sm opacity-70 min-h-[1.5rem]';
    },
  };
}
