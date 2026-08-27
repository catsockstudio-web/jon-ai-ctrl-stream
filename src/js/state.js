/* ============================================================
   state.js — the shape of overlay state.

   State is one plain JSON object. The SERVER owns it and persists
   it to state.json; every browser page, the control page included,
   holds a replica it receives over SSE. Nothing here touches
   localStorage: two clients in different browsers would not share
   it, and that is precisely the case this package has to support.

   What remains here is the shape and the merge rule, which the
   server and the clients must agree on exactly.
   ============================================================ */

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
    chat:     { messages: [...config.chat.demoMessages], maxMessages: config.chat.maxMessages },
  };
}
