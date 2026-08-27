/* ============================================================
   transport.js — the client half of the server-authoritative
   transport.

   Reads and writes go to the server over plain HTTP; changes
   arrive over Server-Sent Events. Because the server mediates,
   the control page and the OBS sources do not need to share a
   browser, a profile, or anything else — only the server's
   address, which they already have by being served from it.

   Paths are origin-relative, so a page at /scenes/gameplay.html
   and one at /control.html resolve the same endpoints.
   ============================================================ */

const API = {
  state:  '/api/state',
  events: '/api/events',
  alert:  '/api/alert',
  reset:  '/api/reset',
};

async function post(path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  if (!response.ok) throw new Error(`${path} -> ${response.status}`);
  return response.json();
}

export async function fetchState() {
  const response = await fetch(API.state, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${API.state} -> ${response.status}`);
  return response.json();
}

export const postState = (patch) => post(API.state, patch);
export const postAlert = (alert) => post(API.alert, alert);
export const postReset = () => post(API.reset, {});

/**
 * Open the event stream.
 *
 * EventSource reconnects on its own, and the server answers every new
 * connection with a full `state` event. That single rule covers three
 * cases with no extra code: a source opening for the first time, a source
 * being refreshed in OBS, and the server being restarted underneath a
 * source that stayed open.
 *
 * @param {object} handlers
 * @param {(state: object) => void} handlers.onState  full snapshot
 * @param {(patch: object) => void} handlers.onPatch  incremental change
 * @param {(alert: object) => void} handlers.onAlert  one-shot alert
 * @param {(status: 'open'|'lost') => void} [handlers.onStatus]
 * @returns {() => void} close
 */
export function openStream({ onState, onPatch, onAlert, onStatus }) {
  const source = new EventSource(API.events);

  source.addEventListener('state', (event) => onState?.(JSON.parse(event.data)));
  source.addEventListener('patch', (event) => onPatch?.(JSON.parse(event.data)));
  source.addEventListener('alert', (event) => onAlert?.(JSON.parse(event.data)));

  source.addEventListener('open',  () => onStatus?.('open'));
  source.addEventListener('error', () => {
    /* EventSource retries by itself; this is a status signal, not a failure
       to handle. Overlays deliberately keep rendering their last known state
       while the server is away rather than blanking on air. */
    onStatus?.('lost');
  });

  return () => source.close();
}
