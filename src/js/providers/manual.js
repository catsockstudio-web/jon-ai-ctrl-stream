/* ============================================================
   manual.js — ManualProvider.

   The shipping provider. Data comes from the operator via the
   control page; there are no credentials, accounts, or outbound
   network calls.

   The server owns state. This provider is a thin client of it:
   reads come from GET /api/state and the SSE stream, writes go
   out as POSTs. Nothing here depends on the control page sharing
   a browser with the overlays — which is what lets the control
   page live in Chrome or Edge while the scenes run inside OBS.
   ============================================================ */

import { Provider } from './provider.js';
import { fetchState, openStream, postState, postAlert, postReset } from '../transport.js';

export class ManualProvider extends Provider {
  static id = 'manual';

  #close = null;

  get capabilities() { return { edit: true, fireAlerts: true }; }

  async start() {
    /* Fetch before opening the stream so the first paint already has real
       state; the stream's opening `state` event then keeps it current. */
    try {
      this.store.replaceState(await fetchState());
    } catch (err) {
      /* Server not up yet. Defaults render, and the stream's first event
         corrects them as soon as it connects. */
      console.warn('[manual] could not reach the server for initial state', err);
    }

    this.#close = openStream({
      onState: (state) => this.store.replaceState(state),
      onPatch: (patch) => this.store.applyState(patch),
      onAlert: (alert) => this.store.emitAlert(alert),
      onStatus: (status) => this.store.applyState({ connection: status }),
    });
  }

  stop() {
    this.#close?.();
    this.#close = null;
  }

  publish(patch) {
    /* Apply locally first so the control page's own UI never waits on its
       own round trip. The server's broadcast then confirms it, and every
       other client applies the identical patch. */
    this.store.applyState(patch);
    postState(patch).catch((err) => console.error('[manual] publish failed', err));
  }

  publishAlert(alert) {
    /* Not applied locally: the server stamps the id and broadcasts to every
       client including this one, so the alert fires exactly once here. */
    postAlert(alert).catch((err) => console.error('[manual] alert failed', err));
  }

  /** Control-page only: drop saved state and return to config.js defaults. */
  resetToDefaults() {
    postReset().catch((err) => console.error('[manual] reset failed', err));
  }
}
