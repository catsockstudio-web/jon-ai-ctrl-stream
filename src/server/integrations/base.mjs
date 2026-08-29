/* ============================================================
   base.mjs — the server-side integration contract.

   Providers run HERE, in the server process, not in the browser.
   Two reasons, both non-negotiable:

     1. Access tokens must never reach a page. Scenes are loaded by
        OBS and by any browser on the machine; a token in page
        JavaScript is a token in every one of them.
     2. The server already owns state and already pushes to every
        source over SSE. An integration that writes into that path
        reaches the overlays with no new transport and no scene
        changes at all.

   An integration turns whatever a platform sends into two things
   the rest of the package already understands:

     ctx.emitAlert({ kind, name, ... })   a one-shot alert
     ctx.patch({ ... })                   a state change

   Nothing below this line knows what Twitch is.
   ============================================================ */

/** The alert kinds every integration must normalise to. */
export const KINDS = ['follower', 'sub', 'tip', 'bits', 'raid', 'giftSub'];

/**
 * Connection states, in the order a user moves through them.
 *   off       — no credentials stored
 *   pending   — waiting for the user to approve on the platform's site
 *   linked    — credentials good, events flowing
 *   error     — credentials good but something is wrong; detail says what
 */
export const STATES = ['off', 'pending', 'linked', 'error'];

export class Integration {
  /** Stable id, used in URLs and in credentials.json. */
  static id = 'base';
  /** Shown in the dashboard. */
  static label = 'Base';
  static blurb = '';
  /** False for integrations that need no account (the relay). */
  static needsAuth = true;

  /**
   * @param {object} ctx
   * @param {(alert: object) => void} ctx.emitAlert  fire a one-shot alert
   * @param {(patch: object) => void} ctx.patch      merge into overlay state
   * @param {(msg: string) => void}   ctx.log
   * @param {object} ctx.store   credential read/write for this integration
   * @param {object} ctx.config
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.state = 'off';
    this.detail = '';
    this.account = '';
  }

  get status() {
    return {
      id: this.constructor.id,
      label: this.constructor.label,
      blurb: this.constructor.blurb,
      needsAuth: this.constructor.needsAuth,
      state: this.state,
      detail: this.detail,
      account: this.account,
    };
  }

  /**
   * What this integration takes ownership of once linked, so the dashboard
   * can show those fields read-only instead of pretending an edit will
   * stick. A live follower count that a user can still type over is a lie.
   * @returns {string[]} state paths, e.g. ['goals.items.follower.current']
   */
  get owns() { return []; }

  /**
   * Begin linking. Returns either
   *   { kind: 'device', userCode, verifyUrl, expiresIn }  — show the code
   *   { kind: 'ready' }                                   — nothing to do
   */
  async connect() { throw new Error('not implemented'); }

  /** Start consuming events with stored credentials. Safe to call twice. */
  async start() {}

  /** Stop consuming. Credentials are kept. */
  async stop() {}

  /** Stop and forget credentials. */
  async disconnect() { await this.stop(); await this.ctx.store.clear(); this.state = 'off'; this.account = ''; }
}

/** Small helper: a promise that rejects if the request takes too long. */
export async function jsonFetch(url, options = {}, timeoutMs = 10000) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  return { ok: res.ok, status: res.status, body };
}
