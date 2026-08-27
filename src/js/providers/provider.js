/* ============================================================
   provider.js — the data-provider contract.

   A provider is the ONLY thing that knows where overlay data comes
   from. It pushes into the store; scenes read the store. That seam
   is what lets a live Twitch/StreamElements/Streamer.bot provider
   replace the manual one later without touching a single scene,
   widget, or stylesheet.

   To add a provider:
     1. subclass Provider
     2. in start(), begin feeding store.applyState() / store.emitAlert()
     3. register it in ./index.js
     4. set `provider: '<id>'` in config.js
   ============================================================ */

/**
 * @typedef {object} Alert
 * @property {'follower'|'sub'|'tip'|'bits'} kind
 * @property {string}  name      viewer name
 * @property {string} [kicker]   overrides the default kicker line
 * @property {string} [message]  tip/sub message
 * @property {string} [amount]   "$5.00", "500", "TIER 1 · 3 MONTHS"
 */

export class Provider {
  /** Stable id used by config.provider and the registry. */
  static id = 'base';

  /**
   * @param {import('../store.js').Store} store
   * @param {object} config
   */
  constructor(store, config) {
    this.store = store;
    this.config = config;
  }

  /**
   * What the control page may drive on this provider.
   *   edit       — state fields are writable (topic, goals, toggles…)
   *   fireAlerts — test/real alerts can be pushed on demand
   * A live provider that owns its own numbers should report
   * edit:false for those, so the control page shows them read-only
   * instead of pretending an edit will stick.
   */
  get capabilities() { return { edit: false, fireAlerts: false }; }

  /** Begin feeding the store. Called once. */
  async start() {}

  /** Tear down sockets, timers, listeners. */
  stop() {}

  /** Control-page write path. Only meaningful when capabilities.edit. */
  publish(_patch) {}

  /** Control-page alert path. Only meaningful when capabilities.fireAlerts. */
  publishAlert(_alert) {}
}
