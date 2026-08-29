/* ============================================================
   twitch.mjs — Twitch via Device Code Flow + EventSub WebSocket.

   Two choices here are load-bearing, and both exist to keep the
   package's central promise: everything runs on your own PC.

   1. DEVICE CODE FLOW, not authorization code.
      The authorization-code flow wants a client secret. A secret
      shipped inside a folder the customer holds is not a secret.
      Device flow needs only a public client id: the server asks
      Twitch for a short code, the user types it at twitch.tv/activate,
      and the server exchanges it for tokens. Nothing confidential
      is distributed.

   2. EVENTSUB OVER WEBSOCKET, not webhooks.
      Webhook EventSub needs a public HTTPS endpoint. That would
      force a tunnel or a hosted relay and break "nothing leaves your
      machine". The WebSocket transport is outbound-only, so a
      localhost-bound server can receive live events with no inbound
      port, no domain, and no certificate.

   Chat arrives over the same socket (channel.chat.message), so
   there is no second connection and no IRC library.
   ============================================================ */

import { Integration, jsonFetch } from './base.mjs';

const ID_BASE  = process.env.JA_TWITCH_ID_BASE  ?? 'https://id.twitch.tv';
const API_BASE = process.env.JA_TWITCH_API_BASE ?? 'https://api.twitch.tv';
const WS_URL   = process.env.JA_TWITCH_WS_URL   ?? 'wss://eventsub.wss.twitch.tv/ws';

/* Read-only scopes, one per thing we surface. Asking for less than this
   means an event silently never arrives; asking for more is rude. */
const SCOPES = [
  'user:read:chat',
  'channel:read:subscriptions',
  'moderator:read:followers',
  'bits:read',
];

/* type, version, and how to build the condition. Keeping this as data means
   adding an event is a row here, not a new branch in the socket handler. */
const SUBSCRIPTIONS = [
  { type: 'stream.online',                 version: '1', cond: (u) => ({ broadcaster_user_id: u }) },
  { type: 'stream.offline',                version: '1', cond: (u) => ({ broadcaster_user_id: u }) },
  { type: 'channel.follow',                version: '2', cond: (u) => ({ broadcaster_user_id: u, moderator_user_id: u }) },
  { type: 'channel.subscribe',             version: '1', cond: (u) => ({ broadcaster_user_id: u }) },
  { type: 'channel.subscription.gift',     version: '1', cond: (u) => ({ broadcaster_user_id: u }) },
  { type: 'channel.subscription.message',  version: '1', cond: (u) => ({ broadcaster_user_id: u }) },
  { type: 'channel.cheer',                 version: '1', cond: (u) => ({ broadcaster_user_id: u }) },
  { type: 'channel.raid',                  version: '1', cond: (u) => ({ to_broadcaster_user_id: u }) },
  { type: 'channel.chat.message',          version: '1', cond: (u) => ({ broadcaster_user_id: u, user_id: u }) },
];

const TIER = { 1000: 'TIER 1', 2000: 'TIER 2', 3000: 'TIER 3', Prime: 'PRIME' };

export class TwitchIntegration extends Integration {
  static id = 'twitch';
  static label = 'Twitch';
  static blurb = 'Follows, subs, gifts, cheers, raids, chat and live status.';

  #socket = null;
  #keepalive = null;
  #devicePoll = null;
  #stopping = false;
  #retry = 0;

  get owns() {
    /* Once Twitch is linked it is the truth for these, so the dashboard
       shows them read-only rather than letting an edit be overwritten
       by the next event. */
    return this.state === 'linked'
      ? ['stream.startedAt', 'goals.items.follower.current', 'goals.items.sub.current']
      : [];
  }

  get #clientId() {
    return process.env.JA_TWITCH_CLIENT_ID || this.ctx.config.twitch?.clientId || '';
  }

  /* ---------- linking ---------- */

  async connect() {
    if (!this.#clientId) {
      throw new Error('No Twitch client id configured. See the manual, "Connecting Twitch".');
    }
    const { ok, body } = await jsonFetch(`${ID_BASE}/oauth2/device`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.#clientId, scopes: SCOPES.join(' ') }),
    });
    if (!ok || !body?.device_code) {
      throw new Error(`Twitch refused the device request (${body?.message ?? 'unknown'}).`);
    }

    this.state = 'pending';
    this.detail = 'Waiting for you to approve it on Twitch.';
    this.#pollForToken(body);

    return {
      kind: 'device',
      userCode: body.user_code,
      verifyUrl: body.verification_uri ?? 'https://www.twitch.tv/activate',
      expiresIn: body.expires_in ?? 1800,
    };
  }

  /** Poll the token endpoint until the user approves, refuses, or it expires. */
  #pollForToken(device) {
    clearInterval(this.#devicePoll);
    const started = Date.now();
    const every = Math.max(1, Number(device.interval) || 5) * 1000;
    const until = started + (Number(device.expires_in) || 1800) * 1000;

    this.#devicePoll = setInterval(async () => {
      if (Date.now() > until) {
        clearInterval(this.#devicePoll);
        this.state = 'off';
        this.detail = 'The code expired. Press Connect to try again.';
        return;
      }
      const { body } = await jsonFetch(`${ID_BASE}/oauth2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.#clientId,
          device_code: device.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      }).catch(() => ({ body: null }));

      if (!body?.access_token) return;   /* authorization_pending is normal */

      clearInterval(this.#devicePoll);
      await this.ctx.store.set({
        accessToken: body.access_token,
        refreshToken: body.refresh_token ?? '',
        obtainedAt: Date.now(),
      });
      await this.start();
    }, every);
    this.#devicePoll.unref?.();
  }

  async #refresh() {
    const saved = await this.ctx.store.get();
    if (!saved?.refreshToken) return false;
    const { ok, body } = await jsonFetch(`${ID_BASE}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.#clientId,
        refresh_token: saved.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!ok || !body?.access_token) return false;
    await this.ctx.store.set({
      ...saved,
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? saved.refreshToken,
      obtainedAt: Date.now(),
    });
    return true;
  }

  async #helix(path, init = {}, retrying = false) {
    const saved = await this.ctx.store.get();
    const res = await jsonFetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${saved?.accessToken ?? ''}`,
        'client-id': this.#clientId,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    /* One silent refresh, then give up and say so. */
    if (res.status === 401 && !retrying && await this.#refresh()) {
      return this.#helix(path, init, true);
    }
    return res;
  }

  /* ---------- running ---------- */

  async start() {
    const saved = await this.ctx.store.get();
    if (!saved?.accessToken) { this.state = 'off'; return; }
    this.#stopping = false;

    const me = await this.#helix('/helix/users');
    const user = me.body?.data?.[0];
    if (!user) {
      this.state = 'error';
      this.detail = 'Twitch would not confirm the account. Try disconnecting and connecting again.';
      return;
    }
    this.userId = user.id;
    this.account = user.display_name ?? user.login ?? '';
    this.#openSocket();
  }

  #openSocket(url = WS_URL) {
    this.#closeSocket();
    this.state = 'pending';
    this.detail = 'Connecting to Twitch…';

    const socket = new WebSocket(url);
    this.#socket = socket;

    socket.addEventListener('message', (event) => {
      let frame;
      try { frame = JSON.parse(event.data); } catch { return; }
      this.#onFrame(frame);
    });
    socket.addEventListener('close', () => this.#onDrop());
    socket.addEventListener('error', () => this.#onDrop());
  }

  #closeSocket() {
    clearTimeout(this.#keepalive);
    if (this.#socket) {
      const s = this.#socket;
      this.#socket = null;
      try { s.close(); } catch { /* already closing */ }
    }
  }

  /** Reconnect with backoff. A stream must not need babysitting. */
  #onDrop() {
    if (this.#stopping || !this.#socket) return;
    this.#socket = null;
    this.state = 'error';
    this.detail = 'Lost the Twitch connection — retrying.';
    const wait = Math.min(30000, 1000 * 2 ** this.#retry++);
    setTimeout(() => { if (!this.#stopping) this.#openSocket(); }, wait).unref?.();
  }

  /** Twitch promises a keepalive on a timer; silence means a dead socket. */
  #armKeepalive(seconds) {
    clearTimeout(this.#keepalive);
    this.#keepalive = setTimeout(() => this.#onDrop(), (seconds + 10) * 1000);
    this.#keepalive.unref?.();
  }

  async #onFrame(frame) {
    const type = frame?.metadata?.message_type;

    if (type === 'session_welcome') {
      this.#retry = 0;
      const session = frame.payload?.session;
      this.#armKeepalive(Number(session?.keepalive_timeout_seconds) || 30);
      await this.#subscribe(session?.id);
      this.state = 'linked';
      this.detail = 'Live. Events are flowing.';
      return;
    }
    if (type === 'session_keepalive') {
      this.#armKeepalive(30);
      return;
    }
    if (type === 'session_reconnect') {
      /* Twitch hands us a new URL and keeps the old socket alive until we
         have welcomed on the new one. Follow it rather than dropping. */
      const next = frame.payload?.session?.reconnect_url;
      if (next) this.#openSocket(next);
      return;
    }
    if (type === 'revocation') {
      this.state = 'error';
      this.detail = 'Twitch revoked access. Disconnect and connect again.';
      return;
    }
    if (type === 'notification') {
      this.#armKeepalive(30);
      this.#onEvent(frame.metadata.subscription_type, frame.payload?.event ?? {});
    }
  }

  async #subscribe(sessionId) {
    if (!sessionId || !this.userId) return;
    const failed = [];
    for (const sub of SUBSCRIPTIONS) {
      const res = await this.#helix('/helix/eventsub/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          type: sub.type,
          version: sub.version,
          condition: sub.cond(this.userId),
          transport: { method: 'websocket', session_id: sessionId },
        }),
      });
      if (!res.ok) failed.push(sub.type);
    }
    if (failed.length) {
      /* Partial is normal — a scope the user did not grant, or an event their
         account type cannot send. Say which, rather than looking connected
         while one kind of alert never arrives. */
      this.ctx.log(`twitch: not subscribed to ${failed.join(', ')}`);
      this.detail = `Live, but not receiving: ${failed.join(', ')}.`;
    }
  }

  /* ---------- events ---------- */

  #onEvent(type, e) {
    const alert = (kind, fields) => this.ctx.emitAlert({ kind, ...fields });

    switch (type) {
      case 'stream.online':
        this.ctx.patch({ stream: { startedAt: Date.parse(e.started_at) || Date.now() } });
        return;
      case 'stream.offline':
        this.ctx.patch({ stream: { startedAt: null } });
        return;

      case 'channel.follow':
        alert('follower', { name: e.user_name ?? e.user_login ?? '' });
        this.#bumpGoal('follower');
        return;

      case 'channel.subscribe':
        /* A gifted sub also raises channel.subscribe for the recipient.
           Skipping it here stops one gift drawing two alerts. */
        if (e.is_gift) return;
        alert('sub', { name: e.user_name ?? '', tier: TIER[e.tier] ?? '' });
        this.#bumpGoal('sub');
        return;

      case 'channel.subscription.message':
        alert('sub', {
          name: e.user_name ?? '',
          tier: TIER[e.tier] ?? '',
          message: e.message?.text ?? '',
          count: String(e.cumulative_months ?? ''),
        });
        this.#bumpGoal('sub');
        return;

      case 'channel.subscription.gift':
        alert('giftSub', {
          name: e.is_anonymous ? 'Anonymous' : (e.user_name ?? ''),
          tier: TIER[e.tier] ?? '',
          count: String(e.total ?? 1),
        });
        this.#bumpGoal('sub', Number(e.total) || 1);
        return;

      case 'channel.cheer':
        alert('bits', {
          name: e.is_anonymous ? 'Anonymous' : (e.user_name ?? ''),
          amount: String(e.bits ?? ''),
          count: String(e.bits ?? ''),
          message: e.message ?? '',
        });
        return;

      case 'channel.raid':
        alert('raid', {
          name: e.from_broadcaster_user_name ?? '',
          count: String(e.viewers ?? ''),
        });
        return;

      case 'channel.chat.message':
        this.ctx.chat({
          user: e.chatter_user_name ?? e.chatter_user_login ?? '',
          text: e.message?.text ?? '',
          colour: e.color || '',
          badges: (e.badges ?? []).map((b) => b.set_id),
        });
        return;

      default:
    }
  }

  /** Live counts move on their own; the target stays the operator's choice. */
  #bumpGoal(key, by = 1) {
    const goal = this.ctx.readState()?.goals?.items?.[key];
    if (!goal) return;
    this.ctx.patch({ goals: { items: { [key]: { current: Number(goal.current || 0) + by } } } });
  }

  async stop() {
    this.#stopping = true;
    clearInterval(this.#devicePoll);
    this.#closeSocket();
    if (this.state === 'linked') { this.state = 'off'; this.detail = ''; }
  }
}
