export function createDebugPanel({ state, statusBar, generatePlan, buildOverrides, collectRuleSnapshot, formatError }) {
  const debugSection = document.createElement('section');
  debugSection.className = 'rounded-lg border border-dashed border-gray-300 bg-white/80 p-4 space-y-3';

  const header = document.createElement('div');
  header.className = 'flex items-start justify-between gap-3';
  const titleWrap = document.createElement('div');
  titleWrap.className = 'space-y-1';
  const title = document.createElement('h2');
  title.className = 'text-lg font-semibold';
  title.textContent = 'Solver-Diagnose';
  const text = document.createElement('p');
  text.className = 'text-xs text-gray-600 max-w-sm';
  text.textContent = 'Starte Trockenläufe, um Regelkombinationen zu prüfen. Jeder Lauf nutzt die aktuelle Stundenverteilung und speichert keinen Plan.';
  titleWrap.append(title, text);

  const debugButton = document.createElement('button');
  debugButton.type = 'button';
  debugButton.className = 'btn btn-sm btn-outline';
  debugButton.textContent = 'Regel-Check starten';
  header.append(titleWrap, debugButton);

  const debugStatus = document.createElement('p');
  debugStatus.className = 'text-xs text-gray-500';
  debugStatus.textContent = 'Noch kein Debug-Lauf gestartet.';

  const debugResults = document.createElement('div');
  debugResults.className = 'overflow-x-auto';

  debugSection.append(header, debugStatus, debugResults);

  debugButton.addEventListener('click', async () => {
    if (state.debugRunning) return;
    await runRuleDiagnostics();
  });

  async function runRuleDiagnostics() {
    if (!state.selectedVersionId) {
      statusBar.set('Bitte wähle zuerst eine Stundenverteilung für den Debug-Lauf aus.', true);
      return;
    }
    if (state.debugRunning) return;

    state.debugRunning = true;
    state.debugStale = false;
    debugButton.disabled = true;
    debugStatus.textContent = 'Starte Debug-Läufe…';

    const runs = [];
    renderDebugResults([]);

    const ruleSnapshot = collectRuleSnapshot();
    const boolDefs = state.rulesDefinition?.bools || [];

    const baseline = await executeDryRun('baseline', 'Aktuelle Regeln', ruleSnapshot, 'Aktuelle Einstellungen');
    runs.push(baseline);

    for (const rule of boolDefs) {
      const currentValue = !!ruleSnapshot[rule.key];
      if (!currentValue) continue;
      const toggledRules = { ...ruleSnapshot, [rule.key]: false };
      const label = `${rule.label || rule.key} deaktiviert`;
      const result = await executeDryRun(rule.key, label, toggledRules, `${rule.label || rule.key} deaktiviert`);
      runs.push(result);
    }

    state.debugRuns = runs;
    renderDebugResults(runs);

    const failures = runs.filter(run => !run.success).length;
    if (failures) {
      debugStatus.textContent = `${runs.length} Debug-Läufe abgeschlossen – ${failures} ohne Lösung.`;
    } else {
      debugStatus.textContent = `${runs.length} Debug-Läufe abgeschlossen.`;
    }

    debugButton.disabled = false;
    state.debugRunning = false;
  }

  async function executeDryRun(key, label, ruleValues, changeSummary) {
    const payload = {
      name: `${state.planName || 'Plan'} • Debug`,
      comment: null,
      version_id: state.selectedVersionId,
      rule_profile_id: state.selectedRuleProfileId,
      override_rules: { ...ruleValues },
      params: { ...state.params },
      dry_run: true,
    };
    const start = performance.now();
    try {
      const response = await generatePlan(payload);
      const duration = performance.now() - start;
      return {
        key,
        label,
        change: changeSummary,
        success: true,
        status: response.status,
        score: response.score,
        duration,
      };
    } catch (err) {
      const duration = performance.now() - start;
      return {
        key,
        label,
        change: changeSummary,
        success: false,
        status: 'FAILED',
        score: null,
        duration,
        error: formatError(err),
      };
    }
  }

  function renderDebugResults(runs = state.debugRuns) {
    debugResults.innerHTML = '';
    if (!runs || !runs.length) {
      const note = document.createElement('p');
      note.className = 'text-sm opacity-60';
      note.textContent = state.debugRunning ? 'Debug-Läufe laufen…' : 'Noch keine Debug-Läufe durchgeführt.';
      debugResults.appendChild(note);
      return;
    }

    const table = document.createElement('table');
    table.className = 'table table-sm';
    table.innerHTML = '<thead><tr><th>Szenario</th><th>Status</th><th>Score</th><th>Dauer</th><th>Änderung</th><th>Hinweis</th></tr></thead>';
    const tbody = document.createElement('tbody');
    runs.forEach(run => {
      const tr = document.createElement('tr');
      const hint = run.error || (run.success ? 'OK' : 'Keine Lösung');
      tr.innerHTML = `
        <td>${run.label}</td>
        <td class="${run.success ? 'text-success' : 'text-error'}">${run.status}</td>
        <td>${run.score != null ? run.score.toFixed(2) : '—'}</td>
        <td>${formatDuration(run.duration)}</td>
        <td>${run.change || '—'}</td>
        <td>${hint}</td>
      `;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    debugResults.appendChild(table);
  }

  function markStale() {
    if (state.debugRunning) return;
    state.debugStale = true;
    if (state.debugRuns.length) {
      debugStatus.textContent = 'Einstellungen geändert – Debug erneut starten.';
    } else {
      debugStatus.textContent = 'Noch kein Debug-Lauf gestartet.';
    }
  }

  function formatDuration(ms) {
    if (!Number.isFinite(ms)) return '—';
    if (ms < 1000) return `${Math.round(ms)} ms`;
    const seconds = ms / 1000;
    if (seconds < 10) return `${seconds.toFixed(2)} s`;
    if (seconds < 60) return `${seconds.toFixed(1)} s`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes} min ${rest.toFixed(1)} s`;
  }

  return {
    element: debugSection,
    runRuleDiagnostics,
    renderDebugResults,
    markStale,
  };
}
