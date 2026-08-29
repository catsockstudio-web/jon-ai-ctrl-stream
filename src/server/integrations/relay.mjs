/* ============================================================
   relay.mjs — one local endpoint anything can post an event to.

   Direct integrations are worth building for the platforms a
   streamer actually broadcasts on. They are the wrong answer for
   the long tail: Kick, Trovo, Streamlabs, Ko-fi, Patreon, a Stream
   Deck button, a Streamer.bot action, a Python script watching a
   log file. Writing nine more OAuth clients to reach those would
   be nine more things to break.

   So there is one authenticated local endpoint instead:

     POST http://127.0.0.1:8787/api/ingest/<key>
     { "kind": "tip", "name": "dallas_dev", "amount": "$5.00" }

   Streamer.bot, StreamElements, Streamlabs and OBS scripting can
   all issue an HTTP POST, which makes this the single seam that
   covers every one of them — and anything not invented yet.

   The key is generated per install and is required. Without it any
   page in any browser on this machine could fire alerts on stream.
   ============================================================ */

import { randomBytes } from 'node:crypto';
import { Integration, KINDS } from './base.mjs';

export class RelayIntegration extends Integration {
  static id = 'relay';
  static label = 'Relay (Streamer.bot, StreamElements, anything)';
  static blurb = 'A local address other tools can post events to. No account, no cloud.';
  static needsAuth = false;

  async start() {
    let saved = await this.ctx.store.get();
    if (!saved?.key) {
      saved = { key: randomBytes(16).toString('hex') };
      await this.ctx.store.set(saved);
    }
    this.key = saved.key;
    this.state = 'linked';
    this.detail = 'Listening. Point another tool at the address below.';
  }

  async connect() { await this.start(); return { kind: 'ready' }; }

  /** The dashboard shows this so it can be copied into the other tool. */
  get status() {
    return { ...super.status, endpoint: this.key ? `/api/ingest/${this.key}` : '' };
  }

  /** Rotate the key — the equivalent of signing other tools out. */
  async rotate() {
    await this.ctx.store.set({ key: randomBytes(16).toString('hex') });
    await this.start();
  }

  /**
   * Handle one posted event. Returns a plain reason string when refused, so
   * whoever is wiring up the other tool gets told what was wrong instead of
   * a silent 400.
   */
  accept(key, body) {
    if (!this.key || key !== this.key) return 'wrong or missing key';
    if (!body || typeof body !== 'object') return 'body must be a JSON object';

    /* A chat message is a different shape from an alert. */
    if (body.chat || body.kind === 'chat') {
      const user = String(body.user ?? body.name ?? '').slice(0, 40);
      const text = String(body.text ?? body.message ?? '').slice(0, 300);
      if (!text) return 'chat needs a "text"';
      this.ctx.chat({
        user, text,
        colour: String(body.colour ?? body.color ?? ''),
        /* Optional — a bridge that knows about roles can pass them; most will
           not, and a message without them is perfectly valid. */
        badges: Array.isArray(body.badges) ? body.badges.slice(0, 6).map(String) : undefined,
      });
      return null;
    }

    const kind = String(body.kind ?? '').trim();
    if (!KINDS.includes(kind)) {
      return `"kind" must be one of: ${KINDS.join(', ')}`;
    }
    this.ctx.emitAlert({
      kind,
      name: String(body.name ?? '').slice(0, 40),
      amount: String(body.amount ?? '').slice(0, 24),
      message: String(body.message ?? '').slice(0, 200),
      tier: String(body.tier ?? '').slice(0, 24),
      count: String(body.count ?? '').slice(0, 12),
    });
    return null;
  }

  async stop() { this.state = 'off'; this.detail = ''; }
}
