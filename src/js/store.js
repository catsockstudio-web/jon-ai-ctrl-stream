/* ============================================================
   store.js — the only thing scene and module code ever talks to.

   The store holds overlay state and fans out changes. It knows
   nothing about HTTP, SSE, Twitch, or the control page; a provider
   feeds it. Swapping ManualProvider for TwitchProvider changes
   which code calls applyState() and emitAlert() — and nothing else
   in the package.
   ============================================================ */

import { merge, initialState } from './state.js';

export class Store {
  #state;
  #config;
  #stateListeners = new Set();
  #alertListeners = new Set();
  #provider = null;

  constructor(config) {
    this.#config = config;
    this.#state = initialState(config);
  }

  get config() { return this.#config; }
  get state()  { return this.#state; }
  get provider() { return this.#provider; }

  /* ---------- scene-facing ---------- */

  /** Observe state. Fires immediately with the current snapshot. */
  subscribe(fn) {
    this.#stateListeners.add(fn);
    try { fn(this.#state); } catch (err) { console.error('[store] subscriber failed', err); }
    return () => this.#stateListeners.delete(fn);
  }

  /** Observe alert events (transient — never part of state). */
  onAlert(fn) {
    this.#alertListeners.add(fn);
    return () => this.#alertListeners.delete(fn);
  }

  /* ---------- provider-facing ----------
     A provider calls these to push data in. It must never assume it
     is the only writer, and must never reach into scene code. */

  applyState(patch) {
    this.#state = merge(this.#state, patch);
    this.#notify();
  }

  replaceState(state) {
    this.#state = merge(initialState(this.#config), state);
    this.#notify();
  }

  emitAlert(alert) {
    for (const fn of this.#alertListeners) {
      try { fn(alert); } catch (err) { console.error('[store] alert listener failed', err); }
    }
  }

  #notify() {
    for (const fn of this.#stateListeners) {
      try { fn(this.#state); } catch (err) { console.error('[store] subscriber failed', err); }
    }
  }

  /* ---------- control-facing ----------
     These delegate to the provider. With a read-only provider (a
     future TwitchProvider) they are no-ops, and the control page
     greys out the matching field rather than lying about it. */

  get capabilities() {
    return this.#provider?.capabilities ?? { edit: false, fireAlerts: false };
  }

  /** Change state everywhere and persist it. */
  commit(patch) {
    if (!this.capabilities.edit) return false;
    this.#provider.publish(patch);
    return true;
  }

  /** Fire a one-shot alert on every open scene. */
  fireAlert(alert) {
    if (!this.capabilities.fireAlerts) return false;
    this.#provider.publishAlert(alert);
    return true;
  }

  async attach(provider) {
    this.#provider = provider;
    await provider.start();
    return this;
  }

  detach() {
    this.#provider?.stop();
    this.#provider = null;
  }
}
