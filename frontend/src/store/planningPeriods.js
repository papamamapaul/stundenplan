import {
  fetchPlanningPeriods,
  createPlanningPeriod as apiCreatePlanningPeriod,
  updatePlanningPeriod as apiUpdatePlanningPeriod,
  deletePlanningPeriod as apiDeletePlanningPeriod,
  clonePlanningPeriod as apiClonePlanningPeriod,
} from '../api/planningPeriods.js';
import { formatError } from '../utils/ui.js';

const STORAGE_KEY = 'planning-period-active-id';

let periods = [];
let activeId = null;
let loadPromise = null;
const listeners = new Set();

function notify() {
  const snapshot = { periods: [...periods], activeId };
  listeners.forEach(listener => {
    try {
      listener(snapshot);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('planningPeriods listener failed', err);
    }
  });
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function saveToStorage(id) {
  try {
    if (id == null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, String(id));
    }
  } catch {
    // ignore storage errors
  }
}

async function loadPeriodsFromServer() {
  const response = await fetchPlanningPeriods({ include_inactive: true });
  periods = Array.isArray(response) ? response : [];

  const stored = loadFromStorage();
  const hasStored = stored != null && periods.some(period => period.id === stored);
  const fallback = periods.find(period => period.is_active) ?? periods[0] ?? null;
  activeId = hasStored ? stored : fallback?.id ?? null;
  saveToStorage(activeId);
  notify();
  return periods;
}

export function subscribePlanningPeriods(listener) {
  listeners.add(listener);
  listener({ periods: [...periods], activeId });
  return () => {
    listeners.delete(listener);
  };
}

export function getPlanningPeriodsSnapshot() {
  return { periods: [...periods], activeId };
}

export function getActivePlanningPeriodId() {
  return activeId;
}

export function getActivePlanningPeriod() {
  return periods.find(period => period.id === activeId) ?? null;
}

export async function ensurePlanningPeriodsLoaded() {
  if (periods.length) return periods;
  if (!loadPromise) {
    loadPromise = loadPeriodsFromServer().finally(() => {
      loadPromise = null;
    });
  }
  return loadPromise;
}

export async function refreshPlanningPeriods() {
  if (!loadPromise) {
    loadPromise = loadPeriodsFromServer().finally(() => {
      loadPromise = null;
    });
  }
  return loadPromise;
}

export function setActivePlanningPeriodId(id) {
  const nextId = id == null ? null : Number(id);
  if (Number.isNaN(nextId)) return;
  if (activeId === nextId) return;
  activeId = nextId;
  saveToStorage(activeId);
  notify();
}

export async function createPlanningPeriod(payload) {
  try {
    const result = await apiCreatePlanningPeriod(payload);
    await refreshPlanningPeriods();
    return result;
  } catch (err) {
    throw new Error(formatError(err));
  }
}

export async function updatePlanningPeriod(id, payload) {
  try {
    const result = await apiUpdatePlanningPeriod(id, payload);
    await refreshPlanningPeriods();
    return result;
  } catch (err) {
    throw new Error(formatError(err));
  }
}

export async function deletePlanningPeriod(id) {
  try {
    await apiDeletePlanningPeriod(id);
    if (activeId === id) {
      activeId = null;
      saveToStorage(activeId);
    }
    await refreshPlanningPeriods();
  } catch (err) {
    throw new Error(formatError(err));
  }
}

export async function clonePlanningPeriod(id, payload) {
  try {
    const result = await apiClonePlanningPeriod(id, payload);
    await refreshPlanningPeriods();
    return result;
  } catch (err) {
    throw new Error(formatError(err));
  }
}
