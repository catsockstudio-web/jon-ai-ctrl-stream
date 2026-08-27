/* ============================================================
   manual.js — ManualProvider.

   The shipping provider. Data comes from the operator via the
   control page; there are no credentials, accounts, or network
   calls anywhere in it.

   Transport: the bus (BroadcastChannel + localStorage mirror).
   Persistence: localStorage, so a reopened control page or a
   restarted OBS comes back exactly as it was.
   ============================================================ */

import { Provider } from './provider.js';
import { createBus } from '../bus.js';
import { hydrate, saveState } from '../state.js';

export class ManualProvider extends Provider {
  static id = 'manual';

  #bus = null;
  #unsubscribe = null;

  get capabilities() { return { edit: true, fireAlerts: true }; }

  async start() {
    /* Restore the last saved snapshot before anything paints, so a
       scene never flashes defaults on the way to the real values. */
    this.store.replaceState(hydrate(this.config));

    this.#bus = createBus();
    this.#unsubscribe = this.#bus.subscribe((message) => {
      switch (message.type) {
        case 'state:patch':
          this.store.applyState(message.payload);
          /* Every page keeps its own mirror current, so whichever page
             is open last still has the full snapshot to restore from. */
          saveState(this.store.state);
          break;

        case 'state:replace':
          this.store.replaceState(message.payload);
          saveState(this.store.state);
          break;

        case 'alert':
          this.store.emitAlert(message.payload);
          break;

        /* A scene that opens later asks whoever is listening for the
           current snapshot. Any page holding state answers. */
        case 'state:request':
          this.#bus.post('state:replace', this.store.state);
          break;

        default:
          break;
      }
    });

    /* Announce ourselves in case another page has fresher state than
       what was persisted (e.g. the control page is already open). */
    this.#bus.post('state:request', null);
  }

  stop() {
    this.#unsubscribe?.();
    this.#bus?.close();
    this.#bus = null;
  }

  publish(patch) {
    /* Apply locally first so the control page's own UI is never
       waiting on its own round trip. */
    this.store.applyState(patch);
    saveState(this.store.state);
    this.#bus?.post('state:patch', patch);
  }

  publishAlert(alert) {
    const payload = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...alert };
    this.store.emitAlert(payload);
    this.#bus?.post('alert', payload);
  }

  /** Control-page only: drop saved state and return to config.js defaults. */
  resetToDefaults() {
    const fresh = hydrate({ ...this.config, __fresh: true });
    this.store.replaceState(fresh);
    saveState(this.store.state);
    this.#bus?.post('state:replace', this.store.state);
  }
}
