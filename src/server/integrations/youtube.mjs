/* ============================================================
   youtube.mjs — YouTube Live via Device Code + live chat polling.

   Same auth reasoning as Twitch: device flow, so no client secret
   ships inside a folder the customer holds.

   The shape of the data is genuinely different, and the difference
   is not something a nicer abstraction can hide:

     - There is no push. YouTube's live chat is polled, and it tells
       us how long to wait before asking again. So events arrive a
       few seconds late rather than instantly. That is the platform,
       not the package.
     - Super Chats and memberships arrive inside the chat stream,
       which is why one poll produces both chat lines and alerts.
     - There is no follow event. YouTube subscriptions are not
       published live, so the follower alert has no YouTube source.
       Saying so is better than wiring it to something it is not.
   ============================================================ */

import { Integration, jsonFetch, describeFailure } from './base.mjs';

const OAUTH = process.env.JA_GOOGLE_OAUTH_BASE ?? 'https://oauth2.googleapis.com';
const DEVICE = process.env.JA_GOOGLE_DEVICE_URL ?? 'https://oauth2.googleapis.com/device/code';
const API = process.env.JA_YOUTUBE_API_BASE ?? 'https://www.googleapis.com/youtube/v3';

const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';

export class YouTubeIntegration extends Integration {
  static id = 'youtube';
  static label = 'YouTube Live';
  static blurb = 'Live chat, Super Chats and memberships. Polled, so a few seconds behind.';

  #timer = null;
  #devicePoll = null;
  #stopping = false;
  #seen = new Set();

  get owns() { return this.state === 'linked' ? ['stream.startedAt'] : []; }

  get #clientId() {
    return process.env.JA_GOOGLE_CLIENT_ID || this.ctx.config.youtube?.clientId || '';
  }

  async connect() {
    if (!this.#clientId) {
      throw new Error('No YouTube client id configured. See the manual, "Connecting YouTube".');
    }
    let res;
    try {
      res = await jsonFetch(DEVICE, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: this.#clientId, scope: SCOPE }),
      });
    } catch (err) {
      throw new Error(describeFailure('Google', err));
    }
    const { ok, body } = res;
    if (!ok || !body?.device_code) throw new Error(describeFailure('Google', null, res));

    this.state = 'pending';
    this.detail = 'Waiting for you to approve it on Google.';
    this.#pollForToken(body);
    return {
      kind: 'device',
      userCode: body.user_code,
      verifyUrl: body.verification_url ?? body.verification_uri ?? 'https://www.google.com/device',
      expiresIn: body.expires_in ?? 1800,
    };
  }

  #pollForToken(device) {
    clearInterval(this.#devicePoll);
    const until = Date.now() + (Number(device.expires_in) || 1800) * 1000;
    this.#devicePoll = setInterval(async () => {
      if (Date.now() > until) {
        clearInterval(this.#devicePoll);
        this.state = 'off';
        this.detail = 'The code expired. Press Connect to try again.';
        return;
      }
      const { body } = await jsonFetch(`${OAUTH}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.#clientId,
          device_code: device.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      }).catch(() => ({ body: null }));
      if (!body?.access_token) return;
      clearInterval(this.#devicePoll);
      await this.ctx.store.set({
        accessToken: body.access_token,
        refreshToken: body.refresh_token ?? '',
        expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000,
      });
      await this.start();
    }, Math.max(5, Number(device.interval) || 5) * 1000);
    this.#devicePoll.unref?.();
  }

  async #token() {
    const saved = await this.ctx.store.get();
    if (!saved?.accessToken) return '';
    if (saved.expiresAt && Date.now() < saved.expiresAt - 60_000) return saved.accessToken;
    if (!saved.refreshToken) return saved.accessToken;

    const { body } = await jsonFetch(`${OAUTH}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.#clientId,
        refresh_token: saved.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!body?.access_token) return saved.accessToken;
    await this.ctx.store.set({
      ...saved,
      accessToken: body.access_token,
      expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000,
    });
    return body.access_token;
  }

  async #get(path, params) {
    const token = await this.#token();
    return jsonFetch(`${API}${path}?${new URLSearchParams(params)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
  }

  async start() {
    const saved = await this.ctx.store.get();
    if (!saved?.accessToken) { this.state = 'off'; return; }
    this.#stopping = false;
    this.state = 'pending';
    this.detail = 'Looking for an active broadcast…';
    await this.#findBroadcast();
  }

  async #findBroadcast() {
    if (this.#stopping) return;
    const res = await this.#get('/liveBroadcasts', {
      part: 'snippet,status', broadcastStatus: 'active', broadcastType: 'all', maxResults: '1',
    });
    const live = res.body?.items?.[0];

    if (!live) {
      /* Not an error — they are simply not streaming yet. Keep looking,
         slowly, so going live is picked up without them doing anything. */
      this.state = 'linked';
      this.detail = 'Connected. Waiting for you to go live on YouTube.';
      this.#later(() => this.#findBroadcast(), 60_000);
      return;
    }

    this.chatId = live.snippet?.liveChatId;
    this.account = live.snippet?.channelTitle ?? '';
    this.#seen.clear();
    this.pageToken = undefined;
    this.ctx.patch({
      stream: { startedAt: Date.parse(live.snippet?.actualStartTime) || Date.now() },
    });
    this.state = 'linked';
    this.detail = 'Live. Reading chat.';
    this.#pollChat();
  }

  async #pollChat() {
    if (this.#stopping || !this.chatId) return;
    const res = await this.#get('/liveChat/messages', {
      liveChatId: this.chatId,
      part: 'snippet,authorDetails',
      ...(this.pageToken ? { pageToken: this.pageToken } : {}),
    });

    if (!res.ok) {
      /* The broadcast ended, or the token lapsed. Go back to looking. */
      this.ctx.patch({ stream: { startedAt: null } });
      this.chatId = null;
      this.detail = 'The broadcast ended. Waiting for the next one.';
      this.#later(() => this.#findBroadcast(), 30_000);
      return;
    }

    this.pageToken = res.body?.nextPageToken;
    for (const item of res.body?.items ?? []) this.#onMessage(item);

    /* YouTube tells us how long to wait; obeying it is what keeps the
       API quota from running out mid-stream. */
    const wait = Math.max(2000, Number(res.body?.pollingIntervalMillis) || 5000);
    this.#later(() => this.#pollChat(), wait);
  }

  #onMessage(item) {
    const id = item.id;
    if (!id || this.#seen.has(id)) return;      /* a page can overlap */
    this.#seen.add(id);
    if (this.#seen.size > 400) this.#seen = new Set([...this.#seen].slice(-200));

    const s = item.snippet ?? {};
    const name = item.authorDetails?.displayName ?? '';

    if (s.type === 'superChatEvent' || s.type === 'superStickerEvent') {
      const d = s.superChatDetails ?? s.superStickerDetails ?? {};
      this.ctx.emitAlert({
        kind: 'tip', name,
        amount: d.amountDisplayString ?? '',
        message: d.userComment ?? '',
      });
      return;
    }
    if (s.type === 'newSponsorEvent' || s.type === 'memberMilestoneChatEvent') {
      this.ctx.emitAlert({
        kind: 'sub', name,
        tier: s.memberLevelName ?? '',
        message: s.memberMilestoneChatDetails?.userComment ?? '',
      });
      return;
    }
    if (s.type === 'textMessageEvent') {
      this.ctx.chat({ user: name, text: s.displayMessage ?? s.textMessageDetails?.messageText ?? '' });
    }
  }

  #later(fn, ms) {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(fn, ms);
    this.#timer.unref?.();
  }

  async stop() {
    this.#stopping = true;
    clearTimeout(this.#timer);
    clearInterval(this.#devicePoll);
    if (this.state === 'linked') { this.state = 'off'; this.detail = ''; }
  }
}
