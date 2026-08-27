/* ============================================================
   bus.js — live transport between the control page and every
   open browser source.

   BroadcastChannel is the primary channel. A localStorage mirror
   runs alongside it for two reasons:
     1. late joiners — a scene opened after the control page has
        already been configured needs the current snapshot, and a
        broadcast it missed cannot provide one;
     2. resilience — if BroadcastChannel is unavailable, the
        `storage` event still carries changes between pages.

   Messages are deduplicated by id so a page that receives the
   same change over both paths only applies it once.
   ============================================================ */

const CHANNEL_NAME = 'jon_ai_ctrl';
const MIRROR_KEY   = 'jon_ai_ctrl:last-message';

let seq = 0;
const nextId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function createBus() {
  const listeners = new Set();
  const seen = new Set();

  let channel = null;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
  } catch {
    /* Older or restricted engines: the localStorage mirror carries everything. */
    channel = null;
  }

  function deliver(message) {
    if (!message || typeof message !== 'object' || !message.id) return;
    if (seen.has(message.id)) return;
    seen.add(message.id);
    /* Bound the dedupe set; ids are monotonic enough that the oldest go first. */
    if (seen.size > 512) seen.delete(seen.values().next().value);
    for (const fn of listeners) {
      try { fn(message); } catch (err) { console.error('[bus] listener failed', err); }
    }
  }

  if (channel) channel.onmessage = (event) => deliver(event.data);

  window.addEventListener('storage', (event) => {
    if (event.key !== MIRROR_KEY || !event.newValue) return;
    try { deliver(JSON.parse(event.newValue)); } catch { /* ignore malformed mirror */ }
  });

  return {
    /** Send a message to every other open page. */
    post(type, payload) {
      const message = { id: nextId(), type, payload, at: Date.now() };
      /* Mark as seen so we never handle our own echo. */
      seen.add(message.id);
      if (channel) {
        try { channel.postMessage(message); } catch (err) { console.error('[bus] post failed', err); }
      }
      try { localStorage.setItem(MIRROR_KEY, JSON.stringify(message)); } catch { /* private mode */ }
      return message;
    },

    /** Subscribe to messages from other pages. Returns an unsubscribe fn. */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    close() {
      listeners.clear();
      if (channel) channel.close();
    },
  };
}
