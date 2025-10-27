import {
  exportSetup,
  importSetup,
  exportDistribution,
  importDistribution,
  exportBasisplan,
  importBasisplan,
  exportPlans,
  importPlans,
} from '../api/backup.js';
import { fetchVersions } from '../api/versions.js';
import { fetchPlans } from '../api/plans.js';
import { formatError } from '../utils/ui.js';

export function createBackupView() {
  const container = document.createElement('section');
  container.className = 'space-y-6';
  container.innerHTML = `
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold">Datenexport &amp; -import</h1>
      <p class="text-sm opacity-70">Exportiere Stammdaten, Stundenverteilungen, Basispläne oder berechnete Pläne als JSON-Dateien und spiele sie bei Bedarf wieder ein.</p>
    </div>
  `;

  const statusBar = createStatusBar();
  container.appendChild(statusBar.element);

  const grid = document.createElement('div');
  grid.className = 'grid gap-6 lg:grid-cols-2';
  container.appendChild(grid);

  const state = {
    versions: [],
    plans: [],
    selectedVersionId: null,
    selectedPlanIds: new Set(),
  };

  grid.appendChild(createSetupCard());
  grid.appendChild(createDistributionCard());
  grid.appendChild(createBasisplanCard());
  grid.appendChild(createPlansCard());

  initialize();
  return container;

  function setStatus(message, isError = false) {
    statusBar.set(message, isError);
  }

  function clearStatus() {
    statusBar.clear();
  }

  async function initialize() {
    setStatus('Lade verfügbare Versionen und Pläne…');
    try {
      const [versions, plans] = await Promise.all([fetchVersions(), fetchPlans()]);
      state.versions = versions;
      state.plans = plans;
      state.selectedPlanIds.clear();
      state.selectedVersionId = null;
      updateVersionSelects();
      updatePlanList();
      setStatus('Daten geladen.');
      setTimeout(clearStatus, 1500);
    } catch (err) {
      setStatus(`Fehler beim Laden: ${formatError(err)}`, true);
    }
  }

  function createSetupCard() {
    const card = createCard('Grunddaten (Setup)', 'Lehrkräfte, Klassen, Räume, Fächer, Stundentafel und Regelprofile.');

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-primary btn-sm';
    exportBtn.textContent = 'Setup exportieren';
    exportBtn.addEventListener('click', async () => {
      setStatus('Exportiere Setup…');
      try {
        const data = await exportSetup();
        downloadJson(data, `setup-export-${timestamp()}.json`);
        setStatus('Setup exportiert.');
        setTimeout(clearStatus, 1500);
      } catch (err) {
        setStatus(`Fehler beim Export: ${formatError(err)}`, true);
      }
    });

    const importSection = document.createElement('div');
    importSection.className = 'flex flex-col gap-2';

    const fileInput = createFileInput();
    const replaceLabel = document.createElement('label');
    replaceLabel.className = 'label cursor-pointer justify-start gap-2 text-sm';
    const replaceCheckbox = document.createElement('input');
    replaceCheckbox.type = 'checkbox';
    replaceCheckbox.className = 'checkbox checkbox-sm';
    const replaceText = document.createElement('span');
    replaceText.textContent = 'Bestehende Daten ersetzen';
    replaceLabel.append(replaceCheckbox, replaceText);

    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn-sm';
    importBtn.textContent = 'Setup importieren';
    importBtn.addEventListener('click', async () => {
      if (!fileInput.files.length) {
        setStatus('Bitte eine JSON-Datei auswählen.', true);
        return;
      }
      setStatus('Importiere Setup…');
      try {
        const data = await readJsonFile(fileInput.files[0]);
        await importSetup(data, { replace: replaceCheckbox.checked });
        fileInput.value = '';
        replaceCheckbox.checked = false;
        setStatus('Setup importiert.');
        setTimeout(clearStatus, 1500);
        initialize();
      } catch (err) {
        setStatus(`Fehler beim Import: ${formatError(err)}`, true);
      }
    });

    importSection.append(fileInput, replaceLabel, importBtn);

    card.body.append(exportBtn, importSection);
    return card.wrapper;
  }

  function createDistributionCard() {
    const card = createCard('Stundenverteilung', 'Exportiere oder importiere eine ausgewählte Stundenverteilungs-Version.');

    const select = document.createElement('select');
    select.className = 'select select-bordered select-sm w-full';
    select.addEventListener('change', () => {
      state.selectedVersionId = select.value ? Number(select.value) : null;
    });

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-primary btn-sm';
    exportBtn.textContent = 'Ausgewählte Version exportieren';
    exportBtn.addEventListener('click', async () => {
      if (!state.selectedVersionId) {
        setStatus('Bitte eine Stundenverteilung auswählen.', true);
        return;
      }
      setStatus('Exportiere Stundenverteilung…');
      try {
        const data = await exportDistribution(state.selectedVersionId);
        const version = state.versions.find(item => item.id === state.selectedVersionId);
        const name = version ? version.name.replace(/\s+/g, '_') : `version-${state.selectedVersionId}`;
        downloadJson(data, `stundenverteilung-${name}-${timestamp()}.json`);
        setStatus('Stundenverteilung exportiert.');
        setTimeout(clearStatus, 1500);
      } catch (err) {
        setStatus(`Fehler beim Export: ${formatError(err)}`, true);
      }
    });

    const importSection = document.createElement('div');
    importSection.className = 'flex flex-col gap-2';
    const fileInput = createFileInput();
    const replaceLabel = document.createElement('label');
    replaceLabel.className = 'label cursor-pointer justify-start gap-2 text-sm';
    const replaceCheckbox = document.createElement('input');
    replaceCheckbox.type = 'checkbox';
    replaceCheckbox.className = 'checkbox checkbox-sm';
    const replaceText = document.createElement('span');
    replaceText.textContent = 'Vorhandene Version überschreiben';
    replaceLabel.append(replaceCheckbox, replaceText);

    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn-sm';
    importBtn.textContent = 'Version importieren';
    importBtn.addEventListener('click', async () => {
      if (!fileInput.files.length) {
        setStatus('Bitte eine JSON-Datei auswählen.', true);
        return;
      }
      setStatus('Importiere Stundenverteilung…');
      try {
        const data = await readJsonFile(fileInput.files[0]);
        await importDistribution(data, { replace: replaceCheckbox.checked });
        fileInput.value = '';
        replaceCheckbox.checked = false;
        setStatus('Stundenverteilung importiert.');
        setTimeout(clearStatus, 1500);
        initialize();
      } catch (err) {
        setStatus(`Fehler beim Import: ${formatError(err)}`, true);
      }
    });

    importSection.append(fileInput, replaceLabel, importBtn);

    card.body.append(select, exportBtn, importSection);
    return card.wrapper;
  }

  function createBasisplanCard() {
    const card = createCard('Basisplan', 'Exportiere oder importiere den aktuellen Basisplan.');

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-primary btn-sm';
    exportBtn.textContent = 'Basisplan exportieren';
    exportBtn.addEventListener('click', async () => {
      setStatus('Exportiere Basisplan…');
      try {
        const data = await exportBasisplan();
        const name = data.name ? data.name.replace(/\s+/g, '_') : 'basisplan';
        downloadJson(data, `${name}-${timestamp()}.json`);
        setStatus('Basisplan exportiert.');
        setTimeout(clearStatus, 1500);
      } catch (err) {
        setStatus(`Fehler beim Export: ${formatError(err)}`, true);
      }
    });

    const fileInput = createFileInput();
    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn-sm';
    importBtn.textContent = 'Basisplan importieren';
    importBtn.addEventListener('click', async () => {
      if (!fileInput.files.length) {
        setStatus('Bitte eine JSON-Datei auswählen.', true);
        return;
      }
      setStatus('Importiere Basisplan…');
      try {
        const data = await readJsonFile(fileInput.files[0]);
        await importBasisplan(data);
        fileInput.value = '';
        setStatus('Basisplan importiert.');
        setTimeout(clearStatus, 1500);
      } catch (err) {
        setStatus(`Fehler beim Import: ${formatError(err)}`, true);
      }
    });

    card.body.append(exportBtn, fileInput, importBtn);
    return card.wrapper;
  }

  function createPlansCard() {
    const card = createCard('Berechnete Pläne', 'Mehrere fertige Pläne auswählen, exportieren und wieder importieren.');

    const list = document.createElement('div');
    list.className = 'max-h-52 overflow-auto border border-base-200 rounded-lg divide-y divide-base-200';

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-primary btn-sm';
    exportBtn.textContent = 'Ausgewählte Pläne exportieren';
    exportBtn.addEventListener('click', async () => {
      if (!state.selectedPlanIds.size) {
        setStatus('Bitte mindestens einen Plan auswählen.', true);
        return;
      }
      setStatus('Exportiere Pläne…');
      try {
        const data = await exportPlans([...state.selectedPlanIds]);
        downloadJson(data, `plaene-${timestamp()}.json`);
        setStatus('Pläne exportiert.');
        setTimeout(clearStatus, 1500);
      } catch (err) {
        setStatus(`Fehler beim Export: ${formatError(err)}`, true);
      }
    });

    const fileInput = createFileInput();
    const replaceLabel = document.createElement('label');
    replaceLabel.className = 'label cursor-pointer justify-start gap-2 text-sm';
    const replaceCheckbox = document.createElement('input');
    replaceCheckbox.type = 'checkbox';
    replaceCheckbox.className = 'checkbox checkbox-sm';
    const replaceText = document.createElement('span');
    replaceText.textContent = 'Pläne gleichen Namens überschreiben';
    replaceLabel.append(replaceCheckbox, replaceText);

    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn-sm';
    importBtn.textContent = 'Pläne importieren';
    importBtn.addEventListener('click', async () => {
      if (!fileInput.files.length) {
        setStatus('Bitte eine JSON-Datei auswählen.', true);
        return;
      }
      setStatus('Importiere Pläne…');
      try {
        const data = await readJsonFile(fileInput.files[0]);
        await importPlans(data, { replace: replaceCheckbox.checked });
        fileInput.value = '';
        replaceCheckbox.checked = false;
        setStatus('Pläne importiert.');
        setTimeout(clearStatus, 1500);
        initialize();
      } catch (err) {
        setStatus(`Fehler beim Import: ${formatError(err)}`, true);
      }
    });

    card.body.append(list, exportBtn, fileInput, replaceLabel, importBtn);

    card.list = list;
    return card.wrapper;
  }

  function updateVersionSelects() {
    const selects = container.querySelectorAll('select');
    selects.forEach(select => {
      const previous = select.value;
      select.innerHTML = '<option value="">– Bitte wählen –</option>';
      state.versions.forEach(version => {
        const option = document.createElement('option');
        option.value = version.id;
        option.textContent = version.name;
        select.appendChild(option);
      });
      if (previous && state.versions.some(v => String(v.id) === previous)) {
        select.value = previous;
        state.selectedVersionId = Number(previous);
      } else {
        select.value = '';
        state.selectedVersionId = null;
      }
    });
  }

  function updatePlanList() {
    const list = container.querySelectorAll('.max-h-52')[0];
    if (!list) return;
    list.innerHTML = '';
    state.plans
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .forEach(plan => {
        const item = document.createElement('label');
        item.className = 'flex items-center justify-between gap-3 px-3 py-2';
        const left = document.createElement('div');
        left.className = 'flex flex-col';
        left.innerHTML = `
          <span class="font-medium">${plan.name}</span>
          <span class="text-xs opacity-70">${new Date(plan.created_at).toLocaleString()}</span>
        `;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'checkbox checkbox-sm';
        checkbox.checked = state.selectedPlanIds.has(plan.id);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            state.selectedPlanIds.add(plan.id);
          } else {
            state.selectedPlanIds.delete(plan.id);
          }
        });
        const right = document.createElement('div');
        right.className = 'flex items-center gap-2';
        right.appendChild(checkbox);
        if (plan.score != null) {
          const badge = document.createElement('span');
          badge.className = 'badge badge-outline badge-sm';
          badge.textContent = `Score ${plan.score.toFixed(1)}`;
          right.appendChild(badge);
        }
        item.append(left, right);
        list.appendChild(item);
      });
  }
}

function createCard(title, subtitle) {
  const wrapper = document.createElement('div');
  wrapper.className = 'card bg-base-100 shadow';
  const body = document.createElement('div');
  body.className = 'card-body space-y-3';
  const heading = document.createElement('div');
  heading.className = 'space-y-1';
  const titleEl = document.createElement('h2');
  titleEl.className = 'card-title';
  titleEl.textContent = title;
  heading.appendChild(titleEl);
  if (subtitle) {
    const subtitleEl = document.createElement('p');
    subtitleEl.className = 'text-sm opacity-70';
    subtitleEl.textContent = subtitle;
    heading.appendChild(subtitleEl);
  }
  body.appendChild(heading);
  wrapper.appendChild(body);
  return { wrapper, body };
}

function createFileInput() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.className = 'file-input file-input-bordered file-input-sm w-full';
  return input;
}

function createStatusBar() {
  const element = document.createElement('div');
  element.className = 'rounded-xl border px-4 py-2 text-sm hidden';

  let hideTimer = null;

  function set(message, isError = false) {
    clearTimeout(hideTimer);
    element.textContent = message;
    element.classList.remove('hidden', 'border-error', 'text-error', 'border-success', 'text-success');
    element.classList.add(isError ? 'border-error' : 'border-success', isError ? 'text-error' : 'text-success');
    hideTimer = setTimeout(() => {
      element.classList.add('hidden');
    }, isError ? 4000 : 2000);
  }

  function clear() {
    clearTimeout(hideTimer);
    element.classList.add('hidden');
  }

  return { element, set, clear };
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result);
        resolve(json);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}

function timestamp() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
}
