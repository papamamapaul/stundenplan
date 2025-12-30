# Plan View Architecture

The rebuilt plan UI is structured into small components so that the solver workflow, the Basisplan integration, and the interactive editor remain easy to reason about. The main pieces now live inside `frontend/src/views/plan/`:

- `index.js`: orchestrates data loading, state management, and wires the child components together.
- `components/toolbar.js`: top action bar (plan selection, run/save buttons, view tabs). The toolbar exposes setters so `index.js` can toggle buttons based on the solver state.
- `components/runSummary.js`: renders the status card for the last solver attempt (score, timestamps, active rule profile, etc.).
- `components/rulesPanel.js`: groups the rule toggles into collapsible sections. It receives callbacks for “rules changed” and “debug stale” events so the controller can persist overrides and invalidate diagnostics.
- `components/solverControls.js`: encapsulates all OR-Tools tuning inputs. The parent passes a single callback that is invoked whenever a slider/toggle changes, so state changes stay centralized.
- `components/debugPanel.js`: owns the entire dry‑run UI (button, status text, result table). It receives the `collectRuleSnapshot()` helper plus `generatePlan()` so it can perform diagnostics without touching controller internals.
- `components/analysisPanel.js`: displays the `/plans/analyze` output and hides/shows the main results grid depending on the active tab.
- `components/editorSection.js`: encapsulates the entire “Plan bearbeiten” experience (grid, drag & drop, parking, highlight controls) and exposes helper actions (`startEditingPlan`, `renderTeacherHighlightControls`) that the parent can reuse outside of edit mode.

The editor component exposes a `render()` method plus actions (`startEditingPlan`, `cancelEditingPlan`, `renderTeacherHighlightControls`) so `index.js` only handles high-level layouting. Shared helpers (e.g., `getClassName`) are passed down, ensuring that the grid uses the same naming and colour logic as the Basisplan editor.

`index.js` is now the orchestration layer: it loads data, tracks the shared `state`, and swaps view components in/out (tabs, dialogs, etc.). Each child component receives the slice of state it needs plus callbacks for mutating actions. When adding new features, follow the same pattern: build a component that reads/writes via the controller instead of reaching directly into DOM globals. This keeps cross-cutting concerns—like the status bar, version selection, or Basisplan previews—isolated and easier to test.
