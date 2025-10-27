import { createDataMaintenanceView } from './maintenance.js';
import { createDistributionView } from './distribution.js';
import { createBasisplanView } from './basisplan.js';
import { createPlanView } from './plan.js';
import { createPlanArchiveView } from './plans.js';
import { createBackupView } from './backup.js';

const registry = new Map();

// Register default placeholder views
registry.set('#/plan', () => createPlanView());
registry.set('#/plan/new', () => createPlanView());
registry.set('#/plans', () => createPlanArchiveView());
registry.set('#/basisplan', () => createBasisplanView());
registry.set('#/stundenverteilung', () => createDistributionView());
registry.set('#/datenpflege', () => createDataMaintenanceView());
registry.set('#/einstellungen', () => createSettingsView());
registry.set('#/backup', () => createBackupView());

export function registerView(route, factory) {
  registry.set(route, factory);
}

export function getView(route) {
  if (route.startsWith('#/plan/')) {
    return createPlanView();
  }
  const factory = registry.get(route) || registry.get('#/plan');
  return factory();
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

  const card = document.createElement('div');
  card.className = 'space-y-4';

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
  container.appendChild(body);
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
