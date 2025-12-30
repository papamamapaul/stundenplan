import { ICONS, createIcon } from '../components/icons.js';
import * as basisplanApi from '../api/basisplan.js';
import { buildAccountQuery } from '../api/helpers.js';
import { getActivePlanningPeriodId } from '../store/planningPeriods.js';

const previewBasisplan =
  typeof basisplanApi.previewBasisplan === 'function'
    ? basisplanApi.previewBasisplan
    : async payload => {
        const periodId = getActivePlanningPeriodId();
        const query = buildAccountQuery({
          planning_period_id: periodId != null ? periodId : undefined,
        });
        const res = await fetch(`/basisplan/debug/parse${query}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload ? { payload } : {}),
        });
        if (!res.ok) {
          throw new Error(await res.text());
        }
        return res.json();
      };

export function createAdminTutorialView() {
  const container = document.createElement('section');
  container.className = 'space-y-6';

  container.appendChild(createHero());
  container.appendChild(createChecklist());
  container.appendChild(createBackendInstructions());
  container.appendChild(createBackendWalkthrough());
  container.appendChild(createTestingGuide());
  container.appendChild(createBasisplanPreviewTool());

  return container;
}

function createHero() {
  const card = document.createElement('div');
  card.className = 'card bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg';
  const body = document.createElement('div');
  body.className = 'card-body space-y-3';

  const title = document.createElement('h1');
  title.className = 'card-title text-2xl';
  title.innerHTML = `${createIcon(ICONS.BOOK_OPEN, 'w-6 h-6').outerHTML} Admin Backend Tutorial`;

  const description = document.createElement('p');
  description.className = 'text-sm opacity-90';
  description.textContent =
    'Dieser Bereich dient als Nachschlagewerk für Admins. Hier findest du kompakte Hinweise, wie der Backend-Service aufgebaut ist, welche Endpunkte wichtig sind und welche Tests regelmäßig laufen sollten.';

  body.append(title, description);
  card.appendChild(body);
  return card;
}

function createBackendWalkthrough() {
  const card = document.createElement('div');
  card.className = 'card border border-base-200 shadow-sm';
  const body = document.createElement('div');
  body.className = 'card-body space-y-4';

  const header = document.createElement('div');
  header.className = 'flex items-center gap-3';
  header.innerHTML = `${createIcon(ICONS.LAYERS, 'w-5 h-5 text-blue-600').outerHTML}<div><h2 class="card-title">Backend Setup & Testablauf</h2><p class="text-sm opacity-70">Schritt-für-Schritt Leitfaden für lokale Verifikation.</p></div>`;

  const steps = [
    {
      title: '1 · Umgebung laden',
      items: [
        'source venv/bin/activate',
        'pip install -r requirements.txt (falls nötig)',
        'sqlite3 backend.db ".tables" – verifiziere Datenbankzugriff',
      ],
    },
    {
      title: '2 · Server & UI starten',
      items: [
        'Backend: uvicorn backend.app.main:app --reload',
        'Frontend: npm install && npm run dev (oder moderner build Schritt)',
        'Überprüfe http://localhost:8000/docs und UI-Login',
      ],
    },
    {
      title: '3 · Solver-Testlauf',
      items: [
        'Admin UI → Basisplan-Debugger → Parse ausführen',
        'Plansicht öffnen, "Plan berechnen" (Dry-Run) starten',
        'Terminal-Logs kontrollieren (Solver status, Warnungen)',
      ],
    },
    {
      title: '4 · Test-Suite',
      items: [
        'python -m unittest backend.tests.test_basis_parser',
        'python -m unittest backend.tests.test_planner_service',
        'python -m unittest backend.tests.test_plans_router',
      ],
    },
    {
      title: '5 · Abschluss',
      items: [
        'Ergebnisse dokumentieren (z.B. Notizen, Tickets)',
        'Backend stoppen (Ctrl+C) & venv deaktivieren',
      ],
    },
  ];

  const list = document.createElement('div');
  list.className = 'space-y-4';
  steps.forEach(step => {
    const box = document.createElement('div');
    box.className = 'border rounded-lg p-3 space-y-2 text-sm';
    const title = document.createElement('div');
    title.className = 'font-semibold';
    title.textContent = step.title;
    const items = document.createElement('ul');
    items.className = 'list-disc pl-5 space-y-1 opacity-80 text-xs';
    step.items.forEach(entry => {
      const li = document.createElement('li');
      li.textContent = entry;
      items.appendChild(li);
    });
    box.append(title, items);
    list.appendChild(box);
  });

  const note = document.createElement('p');
  note.className = 'text-xs opacity-70';
  note.textContent = 'Tipp: Wenn Solver-Fehler auftreten, zuerst den Basisplan prüfen – feste Slots und flexible Gruppen müssen konsistent sein.';

  body.append(header, list, note);
  card.appendChild(body);
  return card;
}

function createChecklist() {
  const card = document.createElement('div');
  card.className = 'card border border-base-200 shadow-sm';
  const body = document.createElement('div');
  body.className = 'card-body space-y-4';

  const header = document.createElement('div');
  header.className = 'flex items-center gap-3';
  header.innerHTML = `${createIcon(ICONS.CLIPBOARD, 'w-5 h-5 text-blue-600').outerHTML}<div><h2 class="card-title">Schnell-Check</h2><p class="text-sm opacity-70">Nutze diese Liste, wenn du nach einer Pause wieder einsteigst.</p></div>`;

  const list = document.createElement('ul');
  list.className = 'space-y-2 text-sm';
  [
    'Authentifiziere dich mit einem Admin-Konto (Standard: admin@example.com).',
    'Prüfe über /basisplan/debug/parse, ob aktuelle Basispläne fehlerfrei geparst werden.',
    'Nutze scripts/preview_basisplan.py --input basisplan.json um Draft-Daten zu prüfen.',
    'Starte den Backend-Testlauf: source venv/bin/activate && python -m unittest backend.tests.*',
    'Validiere eine Planberechnung im UI und kontrolliere die Logs im Terminal.',
  ].forEach(entry => {
    const li = document.createElement('li');
    li.className = 'flex items-start gap-2';
    const bullet = document.createElement('span');
    bullet.className = 'mt-1 text-green-500';
    bullet.textContent = '•';
    const text = document.createElement('span');
    text.textContent = entry;
    li.append(bullet, text);
    list.appendChild(li);
  });

  body.append(header, list);
  card.appendChild(body);
  return card;
}

function createBasisplanPreviewTool() {
  const card = document.createElement('div');
  card.className = 'card border border-base-200 shadow-sm';
  const body = document.createElement('div');
  body.className = 'card-body space-y-4';

  const header = document.createElement('div');
  header.className = 'flex flex-col gap-1';
  header.innerHTML = `<h2 class="card-title flex items-center gap-2">${createIcon(ICONS.TERMINAL, 'w-5 h-5 text-blue-600').outerHTML} Basisplan-Debugger</h2><p class="text-sm opacity-70">Teste JSON-Payloads direkt aus dem Admin-Bereich gegen den Parser.</p>`;

  const textarea = document.createElement('textarea');
  textarea.className = 'textarea textarea-bordered w-full font-mono text-xs h-48';
  textarea.placeholder = '{ "meta": { "slots": [] }, "classes": {}, "rooms": {}, "windows": {}, "fixed": {}, "flexible": {} }';

  const hint = document.createElement('p');
  hint.className = 'text-xs opacity-70';
  hint.textContent = 'Lass das Feld leer, um den aktuell gespeicherten Basisplan zu inspizieren oder füge ein JSON ein, um Drafts zu prüfen.';

  const buttons = document.createElement('div');
  buttons.className = 'flex flex-wrap gap-2';
  const loadCurrent = document.createElement('button');
  loadCurrent.className = 'btn btn-sm btn-primary';
  loadCurrent.textContent = 'Aktuellen Basisplan laden';
  const parseOverride = document.createElement('button');
  parseOverride.className = 'btn btn-sm btn-outline';
  parseOverride.textContent = 'JSON analysieren';
  buttons.append(loadCurrent, parseOverride);

  const status = document.createElement('p');
  status.className = 'text-xs text-info hidden';

  const output = document.createElement('pre');
  output.className = 'bg-base-200 rounded-lg p-3 text-xs overflow-x-auto whitespace-pre';
  output.textContent = 'Noch keine Vorschau geladen.';

  async function runPreview(useOverride) {
    status.classList.remove('hidden', 'text-error');
    status.textContent = 'Lade Vorschau ...';
    try {
      const payload = useOverride && textarea.value.trim() ? JSON.parse(textarea.value) : undefined;
      const data = await previewBasisplan(payload);
      output.textContent = JSON.stringify(data, null, 2);
      status.textContent = 'Parser erfolgreich • ' + new Date().toLocaleTimeString();
    } catch (err) {
      status.classList.add('text-error');
      status.textContent = `Fehler: ${err.message || err}`;
    }
  }

  loadCurrent.addEventListener('click', () => runPreview(false));
  parseOverride.addEventListener('click', () => runPreview(true));

  body.append(header, textarea, hint, buttons, status, output);
  card.appendChild(body);
  return card;
}

function createBackendInstructions() {
  const card = document.createElement('div');
  card.className = 'card border border-base-200 shadow-sm';
  const body = document.createElement('div');
  body.className = 'card-body space-y-4';

  const title = document.createElement('h2');
  title.className = 'card-title';
  title.textContent = 'Backend Architektur & Services';

  const paragraphs = [
    'Domain-Schichten: domain/accounts, domain/planner, domain/plans kapseln Geschäftslogik. Router greifen nur auf Services zu.',
    'BasisPlanParser: eigenständige Klasse (domain/planner/basis_parser.py) – lässt sich via CLI (scripts/preview_basisplan.py) oder Debug-Endpoint ansprechen.',
    'PlannerService: orchestriert Requirements → Solver → Persistenz. Tests unter backend/tests/test_planner_service.py.',
    'PlanQueryService: bündelt sämtliche /plans Abfragen (Listen, Details, Slot-Updates), getestet in backend/tests/test_plan_query_service.py.',
    'HTTP-Integrationstests: backend/tests/test_plans_router.py verifizieren alle relevanten Endpunkte – bei Anpassungen unbedingt erweitern.',
  ];
  paragraphs.forEach(text => {
    const p = document.createElement('p');
    p.className = 'text-sm opacity-80';
    p.textContent = text;
    body.appendChild(p);
  });

  const endpointCard = document.createElement('div');
  endpointCard.className = 'bg-base-200 rounded-lg p-4 text-sm space-y-2';
  endpointCard.innerHTML = `
    <div class="font-semibold flex items-center gap-2">${createIcon(ICONS.LOCK, 'w-4 h-4').outerHTML} Wichtige Endpunkte & Kommandos</div>
    <pre class="bg-base-100 rounded-md p-3 overflow-x-auto text-xs">
POST /basisplan/debug/parse?account_id=1&planning_period_id=1  (Admin-Token nötig)
curl -X POST ... -d @basisplan.json

CLI Preview:
source venv/bin/activate
python scripts/preview_basisplan.py --input basisplan.json

Testlauf:
source venv/bin/activate
python -m unittest backend.tests.test_basis_parser \\
    backend.tests.test_plan_query_service \\
    backend.tests.test_planner_service \\
    backend.tests.test_plans_router
    </pre>
  `;

  body.append(title, endpointCard);
  card.appendChild(body);
  return card;
}

function createTestingGuide() {
  const card = document.createElement('div');
  card.className = 'card border border-base-200 shadow-sm';
  const body = document.createElement('div');
  body.className = 'card-body space-y-4';

  const title = document.createElement('h2');
  title.className = 'card-title';
  title.textContent = 'Was testen?';

  const tests = [
    { name: 'BasisPlan Parser', path: 'backend/tests/test_basis_parser.py', goal: 'Validiert Parsing & Fehlerbehandlung.' },
    { name: 'Planner Service', path: 'backend/tests/test_planner_service.py', goal: 'Dry-Run vs. Persistenz, Solver Fehler.' },
    { name: 'PlanQuery Service', path: 'backend/tests/test_plan_query_service.py', goal: 'Listen, Details, Slot-Replacement.' },
    { name: 'Plans Router', path: 'backend/tests/test_plans_router.py', goal: 'HTTP Pfade inkl. Analyze & Generate (Dry-Run).' },
  ];

  const list = document.createElement('div');
  list.className = 'grid gap-4 md:grid-cols-2';
  tests.forEach(test => {
    const item = document.createElement('div');
    item.className = 'border border-dashed border-base-300 rounded-lg p-3 text-sm space-y-1';
    item.innerHTML = `<div class="font-semibold">${test.name}</div><div class="text-xs opacity-70">${test.path}</div><p class="text-xs">${test.goal}</p>`;
    list.appendChild(item);
  });

  body.append(title, list);
  card.appendChild(body);
  return card;
}
