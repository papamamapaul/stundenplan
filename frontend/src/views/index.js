import {
  createDataMaintenanceView,
  createTeachersView,
  createClassesView,
  createSubjectsView,
  createRoomsView,
  createCurriculumView,
  createPlanningPeriodsView,
} from './maintenance.js';
import { createDistributionView } from './distribution.js';
import { createBasisplanView } from './basisplan.js';
import { createPlanView } from './plan/index.js';
import { createPlanArchiveView } from './plans.js';
import { createBackupView } from './backup.js';
import { createLoginView } from './login.js';
import { createAdminUsersView } from './adminUsers.js';
import { createAdminTutorialView } from './adminTutorial.js';
import { fetchSchoolSettings, updateSchoolSettings } from '../api/schoolSettings.js';

const registry = new Map();

// Register default placeholder views
registry.set('#/dashboard', () => createPlaceholder('Dashboard', 'Willkommen im Stundenplan-Dashboard.'));
registry.set('#/planungsperioden', () => createPlanningPeriodsView());
registry.set('#/benutzerprofil', () => createPlaceholder('Benutzerprofil', 'Hier kannst du Benutzereinstellungen verwalten.'));
registry.set('#/plan', () => createPlanView());
registry.set('#/plan/new', () => createPlanView());
registry.set('#/plans', () => createPlanArchiveView());
registry.set('#/basisplan', () => createBasisplanView());
registry.set('#/stundenverteilung', () => createDistributionView());
registry.set('#/datenpflege', () => createDataMaintenanceView());
registry.set('#/lehrer', () => createTeachersView());
registry.set('#/klassen', () => createClassesView());
registry.set('#/faecher', () => createSubjectsView());
registry.set('#/raeume', () => createRoomsView());
registry.set('#/stundentafel', () => createCurriculumView());
registry.set('#/einstellungen', () => createSettingsView());
registry.set('#/backup', () => createBackupView());
registry.set('#/login', () => createLoginView());
registry.set('#/admin/users', () => createAdminUsersView());
registry.set('#/admin/tutorial', () => createAdminTutorialView());

export function registerView(route, factory) {
  registry.set(route, factory);
}

export function getView(route, fullHash) {
  if (route.startsWith('#/plan/')) {
    return createPlanView();
  }
  const factory = registry.get(route) || registry.get('#/plan');
  return factory(fullHash);
}

function createPlaceholder(title, message) {
  const container = document.createElement('section');
  container.className = 'view-placeholder';

  const heading = document.createElement('h1');
  heading.textContent = title;

  const paragraph = document.createElement('p');
  paragraph.textContent = message;

  container.append(heading, paragraph);
  return container;
}

function createSettingsView() {
  const container = document.createElement('section');
  container.className = 'space-y-6';

  const themeCard = document.createElement('div');
  themeCard.className = 'space-y-4';

  const body = document.createElement('div');
  body.className = 'space-y-3';

  const heading = document.createElement('h2');
  heading.className = 'card-title';
  heading.textContent = 'App Settings';

  const description = document.createElement('p');
  description.className = 'text-sm opacity-70';
  description.textContent = 'Passe das Erscheinungsbild der Anwendung an.';

  const themeControl = document.createElement('label');
  themeControl.className = 'form-control w-full max-w-xs';

  const label = document.createElement('div');
  label.className = 'label';
  const labelText = document.createElement('span');
  labelText.className = 'label-text';
  labelText.textContent = 'Theme';
  label.appendChild(labelText);

  const select = document.createElement('select');
  select.className = 'select select-bordered w-full max-w-xs';
  select.innerHTML = THEMES.map(theme => `<option value="${theme}">${theme}</option>`).join('');

  const persisted = localStorage.getItem('app-theme') || document.documentElement.getAttribute('data-theme') || 'light';
  select.value = persisted;

  select.addEventListener('change', () => {
    document.documentElement.setAttribute('data-theme', select.value);
    localStorage.setItem('app-theme', select.value);
  });

  themeControl.append(label, select);
  body.append(heading, description, themeControl);
  themeCard.appendChild(body);
  container.appendChild(themeCard);

  const schoolCard = document.createElement('div');
  schoolCard.className = 'card bg-base-100 shadow-sm border border-base-200';
  const schoolBody = document.createElement('div');
  schoolBody.className = 'card-body space-y-4';

  const schoolHeading = document.createElement('div');
  schoolHeading.innerHTML = `
    <h2 class="card-title">Schulgrunddaten</h2>
    <p class="text-sm opacity-70">Pflege Name, Adresse und globale Parameter deiner Schule.</p>
  `;
  schoolBody.appendChild(schoolHeading);

  const form = document.createElement('form');
  form.className = 'grid gap-4 md:grid-cols-2';

  function createInput(id, labelText, placeholder = '') {
    const wrapper = document.createElement('label');
    wrapper.className = 'form-control w-full';
    const labelEl = document.createElement('span');
    labelEl.className = 'label-text';
    labelEl.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'text';
    input.id = id;
    input.className = 'input input-bordered w-full';
    input.placeholder = placeholder;
    wrapper.append(labelEl, input);
    return { wrapper, input };
  }

  const inputs = {
    name: createInput('school-name', 'Schulname*', 'Grundschule Beispielstadt'),
    short_name: createInput('school-short', 'Kurzname', 'GSE'),
    street: createInput('school-street', 'Straße', 'Musterweg 1'),
    postal_code: createInput('school-zip', 'PLZ', '12345'),
    city: createInput('school-city', 'Ort', 'Beispielstadt'),
    school_type: createInput('school-type', 'Schulart', 'Grundschule / Gymnasium …'),
    organization_type: createInput('school-org', 'Organisationsform', 'Halbtag / Ganztag …'),
    phone: createInput('school-phone', 'Telefon'),
    email: createInput('school-email', 'E-Mail'),
  };

  Object.values(inputs).forEach(({ wrapper }) => form.appendChild(wrapper));

  const fullWidthRow = document.createElement('div');
  fullWidthRow.className = 'md:col-span-2 grid gap-4 md:grid-cols-2';

  const dayWrapper = document.createElement('div');
  dayWrapper.className = 'space-y-2';
  const dayLabel = document.createElement('p');
  dayLabel.className = 'text-sm font-semibold';
  dayLabel.textContent = 'Standard-Schultage';
  dayWrapper.appendChild(dayLabel);
  const dayOptions = [
    { key: 'Mo', label: 'Montag' },
    { key: 'Di', label: 'Dienstag' },
    { key: 'Mi', label: 'Mittwoch' },
    { key: 'Do', label: 'Donnerstag' },
    { key: 'Fr', label: 'Freitag' },
  ];
  const dayList = document.createElement('div');
  dayList.className = 'flex flex-wrap gap-2';
  const dayCheckboxes = new Map();
  dayOptions.forEach(opt => {
    const labelEl = document.createElement('label');
    labelEl.className = 'flex items-center gap-2 rounded-lg border border-base-200 px-3 py-2 text-sm';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checkbox checkbox-sm';
    checkbox.value = opt.key;
    const span = document.createElement('span');
    span.textContent = opt.label;
    labelEl.append(checkbox, span);
    dayList.appendChild(labelEl);
    dayCheckboxes.set(opt.key, checkbox);
  });
  dayWrapper.appendChild(dayList);

  const slotWrapper = document.createElement('div');
  slotWrapper.className = 'space-y-2';
  const slotLabel = document.createElement('p');
  slotLabel.className = 'text-sm font-semibold';
  slotLabel.textContent = 'Standard-Zeitblöcke (JSON-Liste)';
  const slotHelp = document.createElement('p');
  slotHelp.className = 'text-xs opacity-70';
  slotHelp.textContent = 'Format: [{"label": "1. Stunde", "start": "08:00", "end": "08:45", "is_pause": false}, …]';
  const slotsTextarea = document.createElement('textarea');
  slotsTextarea.className = 'textarea textarea-bordered w-full';
  slotsTextarea.rows = 6;
  slotsTextarea.placeholder = '[{"label":"1. Stunde","start":"08:00","end":"08:45","is_pause":false}]';
  slotWrapper.append(slotLabel, slotHelp, slotsTextarea);

  fullWidthRow.append(dayWrapper, slotWrapper);
  form.appendChild(fullWidthRow);

  const actionRow = document.createElement('div');
  actionRow.className = 'md:col-span-2 flex flex-wrap items-center gap-3';
  const statusLine = document.createElement('p');
  statusLine.className = 'text-sm opacity-70';
  statusLine.textContent = 'Schuldaten noch nicht geladen.';
  const saveButton = document.createElement('button');
  saveButton.type = 'submit';
  saveButton.className = 'btn btn-primary';
  saveButton.textContent = 'Schuldaten speichern';
  actionRow.append(saveButton, statusLine);
  form.appendChild(actionRow);
  schoolBody.appendChild(form);
  schoolCard.appendChild(schoolBody);
  container.appendChild(schoolCard);

  let currentSettings = null;

  function setStatus(message, variant = 'muted') {
    statusLine.textContent = message;
    statusLine.className = `text-sm ${variant === 'error' ? 'text-error' : variant === 'success' ? 'text-success' : 'opacity-70'}`;
  }

  function fillForm(data) {
    currentSettings = data;
    Object.entries(inputs).forEach(([key, control]) => {
      control.input.value = data?.[key] || '';
    });
    const activeDays = new Set((data?.default_days || []).map(String));
    dayCheckboxes.forEach((checkbox, key) => {
      checkbox.checked = activeDays.has(key);
    });
    const slotValue = (data?.default_slots || []).length ? JSON.stringify(data.default_slots, null, 2) : '';
    slotsTextarea.value = slotValue;
  }

  function collectPayload() {
    const payload = {};
    Object.entries(inputs).forEach(([key, control]) => {
      const value = control.input.value.trim();
      payload[key] = value || null;
    });
    const selectedDays = Array.from(dayCheckboxes.entries())
      .filter(([, checkbox]) => checkbox.checked)
      .map(([key]) => key);
    payload.default_days = selectedDays;

    const slotsValue = slotsTextarea.value.trim();
    if (slotsValue) {
      let parsed;
      try {
        parsed = JSON.parse(slotsValue);
      } catch {
        throw new Error('Zeitblöcke enthalten kein gültiges JSON.');
      }
      if (!Array.isArray(parsed)) {
        throw new Error('Zeitblöcke müssen ein Array sein.');
      }
      payload.default_slots = parsed.map(entry => ({
        label: entry.label || 'Slot',
        start: entry.start || null,
        end: entry.end || null,
        is_pause: Boolean(entry.is_pause),
      }));
    } else {
      payload.default_slots = [];
    }
    return payload;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      saveButton.disabled = true;
      setStatus('Speichere …');
      const payload = collectPayload();
      const result = await updateSchoolSettings(payload);
      fillForm(result);
      setStatus('Schuldaten gespeichert.', 'success');
    } catch (err) {
      setStatus(err.message || 'Speichern fehlgeschlagen.', 'error');
    } finally {
      saveButton.disabled = false;
    }
  });

  async function loadSchoolSettings() {
    try {
      setStatus('Lade Schuldaten …');
      const data = await fetchSchoolSettings();
      fillForm(data);
      setStatus('Schuldaten geladen.');
    } catch (err) {
      setStatus(err.message || 'Schuldaten konnten nicht geladen werden.', 'error');
    }
  }

  loadSchoolSettings();
  return container;
}

const THEMES = [
  'light',
  'dark',
  'cupcake',
  'bumblebee',
  'emerald',
  'corporate',
  'synthwave',
  'retro',
  'cyberpunk',
  'valentine',
  'halloween',
  'garden',
  'forest',
  'aqua',
  'lofi',
  'pastel',
  'fantasy',
  'wireframe',
  'black',
  'luxury',
  'dracula',
  'cmyk',
  'autumn',
  'business',
  'acid',
  'lemonade',
  'night',
  'coffee',
  'winter',
];
