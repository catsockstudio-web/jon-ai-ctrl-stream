/* ============================================================
   registry.mjs — lifecycle and the seam into the rest of the server.

   Every integration gets the same three exits and nothing else:
     emitAlert  fire a one-shot alert on every source
     patch      merge into overlay state
     chat       append a chat line
   None of them knows about SSE, state.json, or the schema.

   The one rule this file enforces is that a live source owns its
   own numbers. When Twitch is linked it reports the follower count,
   so the dashboard must stop offering that field for editing rather
   than let a typed value be overwritten by the next event.
   ============================================================ */

import { CredentialStore } from './credentials.mjs';
import { TwitchIntegration } from './twitch.mjs';
import { YouTubeIntegration } from './youtube.mjs';
import { RelayIntegration } from './relay.mjs';

const AVAILABLE = [TwitchIntegration, YouTubeIntegration, RelayIntegration];

export class Integrations {
  #byId = new Map();
  #creds;

  /**
   * @param {object} hooks
   * @param {(alert: object) => void}  hooks.emitAlert
   * @param {(patch: object) => void}  hooks.patch
   * @param {() => object}             hooks.readState
   * @param {(line: object) => void}   hooks.chat
   * @param {(msg: string) => void}    hooks.log
   * @param {object} config
   * @param {string} credentialsFile
   */
  constructor(hooks, config, credentialsFile) {
    this.#creds = new CredentialStore(credentialsFile);
    for (const Ctor of AVAILABLE) {
      this.#byId.set(Ctor.id, new Ctor({
        emitAlert: hooks.emitAlert,
        patch: hooks.patch,
        readState: hooks.readState,
        chat: hooks.chat,
        log: hooks.log,
        config,
        store: this.#creds.scope(Ctor.id),
      }));
    }
  }

  get(id) { return this.#byId.get(id); }
  get all() { return [...this.#byId.values()]; }

  /** Resume anything that was linked before the server restarted. */
  async resume() {
    const linked = await this.#creds.linked();
    for (const id of linked) {
      const integration = this.#byId.get(id);
      if (!integration) continue;
      try { await integration.start(); }
      catch (err) { integration.state = 'error'; integration.detail = err.message; }
    }
  }

  /**
   * State paths currently owned by a live source. The dashboard shows these
   * read-only, so a field a provider will overwrite is never presented as
   * something you can set.
   */
  get owned() {
    return this.all.flatMap((i) => i.owns);
  }

  status() {
    return { sources: this.all.map((i) => i.status), owned: this.owned };
  }

  async stopAll() {
    for (const i of this.all) { try { await i.stop(); } catch { /* shutting down */ } }
  }
}
