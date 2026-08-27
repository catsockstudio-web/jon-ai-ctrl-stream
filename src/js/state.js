/* ============================================================
   state.js — the shape of overlay state, and how it persists.

   State is one plain JSON object. The control page owns it; every
   scene is a read-only replica. Persistence is localStorage, so
   closing and reopening the control page (or OBS) restores exactly
   what was on screen.
   ============================================================ */

const STORAGE_KEY = 'jon_ai_ctrl:state';
const VERSION_KEY = 'jon_ai_ctrl:version';
const VERSION = 1;

/** Deep-merge plain objects; arrays and scalars are replaced wholesale. */
export function merge(base, patch) {
  if (patch === undefined || patch === null) return base;
  if (Array.isArray(patch) || typeof patch !== 'object') return patch;
  const out = Array.isArray(base) ? [] : { ...(base && typeof base === 'object' ? base : {}) };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = (value && typeof value === 'object' && !Array.isArray(value))
      ? merge(out[key], value)
      : value;
  }
  return out;
}

/** Build the initial state from config defaults. */
export function initialState(config) {
  return {
    channel:  { ...config.channel },
    stream:   { ...config.stream },
    caffeine: { ...config.caffeine },
    goals:    JSON.parse(JSON.stringify(config.goals)),
    activity: JSON.parse(JSON.stringify(config.activity)),
    modules:  { ...config.modules },
    display:  { ...config.display },
    chat:     { messages: [...config.chat.demoMessages] },
  };
}

/** Read the saved snapshot, or null when there is nothing usable. */
export function loadState() {
  try {
    if (Number(localStorage.getItem(VERSION_KEY)) !== VERSION) return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(VERSION_KEY, String(VERSION));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* private mode / quota — live updates still work via the bus */ }
}

export function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(VERSION_KEY);
  } catch { /* ignore */ }
}

/** Restored state, with any keys added since it was saved filled in. */
export function hydrate(config) {
  const saved = loadState();
  return saved ? merge(initialState(config), saved) : initialState(config);
}
