#!/usr/bin/env node
/* ============================================================
   server.mjs — static host AND the authoritative owner of
   runtime overlay state.

   The control page and the OBS sources are separate browser
   clients, often in different browsers entirely: the overlays run
   inside OBS's embedded Chromium while the control page is open in
   Chrome, Edge, or an OBS dock. Nothing in the browser crosses that
   boundary — BroadcastChannel and localStorage are both scoped to a
   single browser profile — so the server mediates instead.

     GET  /api/state    current snapshot
     GET  /api/events   Server-Sent Events stream (state + alerts)
     POST /api/state    merge a patch, persist, broadcast
     POST /api/alert    broadcast a one-shot alert (never persisted)
     POST /api/reset    back to config.js defaults
     POST /api/reset/<branch>  one branch back to its default
     GET  /api/health   which build is running vs what is on disk

   SSE + POST rather than WebSockets: EventSource is native to every
   browser, server-side SSE is a few lines of plain http, and the
   package stays dependency-free.

   Usage:  node server.mjs [port] [--host 0.0.0.0]
   ============================================================ */

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, writeFile, stat, mkdir, readdir, unlink } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { defaults, migrate, SCHEMA_VERSION, EVENT_RING, EVENT_META } from './src/js/schema.js';
import { Integrations } from './src/server/integrations/registry.mjs';
import { brand, productLine } from './src/brand.js';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
/* Where settings persist. Overridable with --state so a second instance —
   the acceptance suite, or a test profile — cannot fight the live server over
   the same file. */
const STATE_FILE = (() => {
  const i = process.argv.indexOf('--state');
  return i !== -1 && process.argv[i + 1] ? resolve(process.argv[i + 1]) : join(ROOT, 'state.json');
})();

/* ---------- staleness ----------
   server.mjs is read into memory once, at startup. The pages it serves are
   read from disk on every request. So after an update the browser gets new
   client code immediately while this process keeps running the old server —
   and a page that calls a route this build does not have just gets a 404.
   That is precisely how the dashboard's RESET buttons came to look broken:
   new buttons, old server, silent 404.

   Fingerprinting our own sources at startup and again on demand turns that
   invisible skew into something the dashboard can state plainly. */
const SOURCE_FILES = ['server.mjs', 'config.js', 'src/js/schema.js'];

async function sourceFingerprint() {
  const hash = createHash('sha1');
  for (const file of SOURCE_FILES) {
    try { hash.update(await readFile(join(ROOT, file))); } catch { hash.update(file); }
  }
  return hash.digest('hex').slice(0, 12);
}

const BOOT_FINGERPRINT = await sourceFingerprint();
const STARTED_AT = Date.now();

/* Tokens live apart from settings so that "Reset everything" cannot sign you
   out, and so no credential is ever inside the document broadcast over SSE. */
const CREDENTIALS_FILE = STATE_FILE.replace(/\.json$/, '') + '.credentials.json';

const args = process.argv.slice(2);
const stateFlag = args.indexOf('--state');
/* Skip the value that follows --state when hunting for the port — but only
   when the flag is actually present, or index 0 would be excluded and a bare
   `node server.mjs 9000` would silently fall back to the default port. */
const PORT = Number(args.find((a, i) => /^\d+$/.test(a) && (stateFlag === -1 || i !== stateFlag + 1))) || 8787;
const hostFlag = args.indexOf('--host');
/* Localhost-only by default. Pass --host 0.0.0.0 deliberately to run the
   control page from another machine on your LAN. */
const HOST = hostFlag !== -1 ? (args[hostFlag + 1] ?? '127.0.0.1') : '127.0.0.1';

const MAX_BODY = 256 * 1024;
/* Uploads get their own, larger cap — a 1920x1080 background is legitimately
   a few MB, while a state patch never is. */
const MAX_UPLOAD = 8 * 1024 * 1024;
const ASSETS_DIR = join(ROOT, 'assets');

/* Only these slots exist, and only these types. Anything else is refused
   before a byte is written. */
const BRANDING_SLOTS = new Set([
  'logo', 'avatar', 'mascot', 'brbArt',
  'startingBackground', 'brbBackground', 'endingBackground',
]);

const IMAGE_TYPES = [
  { ext: 'png',  mime: 'image/png',  magic: [0x89, 0x50, 0x4e, 0x47] },
  { ext: 'jpg',  mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  { ext: 'webp', mime: 'image/webp', magic: [0x52, 0x49, 0x46, 0x46] },
];

/* Trust the bytes, not the header: a content-type is whatever the caller
   claims, while the magic number is what the file actually is. */
function sniffImage(buffer) {
  return IMAGE_TYPES.find((t) => t.magic.every((byte, i) => buffer[i] === byte)) ?? null;
}

/* ---------- state ---------- */

const initialState = () => defaults(config);

/** Deep-merge plain objects; arrays and scalars replace wholesale. */
function merge(base, patch) {
  if (patch === undefined || patch === null) return base;
  if (Array.isArray(patch) || typeof patch !== 'object') return patch;
  const out = { ...(base && typeof base === 'object' && !Array.isArray(base) ? base : {}) };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = (value && typeof value === 'object' && !Array.isArray(value))
      ? merge(out[key], value)
      : value;
  }
  return out;
}

let state = initialState();

/* A stream that "started" more than this long ago is almost certainly a
   leftover from a previous session rather than a crash mid-broadcast, so
   it is dropped on load instead of showing a nonsense uptime. */
const STALE_STREAM_MS = 24 * 60 * 60 * 1000;

async function loadPersisted() {
  try {
    const saved = JSON.parse(await readFile(STATE_FILE, 'utf8'));
    const savedVersion = Number(saved.version) || 1;
    /* Old settings are carried forward explicitly rather than being merged
       into a shape they predate — see migrate() in src/js/schema.js. */
    state = merge(initialState(), migrate(saved, config));
    if (savedVersion < SCHEMA_VERSION) {
      console.log(`  migrated saved settings from schema v${savedVersion} to v${SCHEMA_VERSION}`);
    }
    if (state.stream?.startedAt && Date.now() - state.stream.startedAt > STALE_STREAM_MS) {
      state.stream.startedAt = null;
    }
    console.log('  restored saved state from state.json');
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('  could not read state.json:', err.message);
  }
}

let saveTimer = null;
/** Debounced write — a slider drag should not thrash the disk. */
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      /* The recent-events ring is session history, not settings. Keeping it
         out of state.json is what stops a restarted overlay from showing
         yesterday's followers as if they just happened. */
      const { activity, ...rest } = state;
      const onDisk = { ...rest, activity: { ...activity, events: [] } };
      await writeFile(STATE_FILE, JSON.stringify(onDisk, null, 2));
    } catch (err) {
      console.error('  could not write state.json:', err.message);
    }
  }, 250);
}

/**
 * Add an alert to the recent-events ring.
 *
 * The ring lives in state so a browser source that reconnects gets the list
 * it missed through the ordinary state sync — no second channel, no replay
 * logic in the scene. It is stripped before the state is written to disk,
 * so it is session history and nothing more.
 */
function recordEvent(alert) {
  /* The alert payload calls it "kind"; the stored event calls it "type".
     Accept either so a future provider posting {type} is not silently
     dropped from the list while its alert still fires. */
  const type = alert?.kind ?? alert?.type;
  if (!EVENT_META[type]) return;
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    name: String(alert.name ?? '').slice(0, 40),
    amount: String(alert.amount ?? '').slice(0, 24),
    tier: String(alert.tier ?? '').slice(0, 24),
    count: String(alert.count ?? '').slice(0, 12),
    at: Date.now(),
  };
  const events = [entry, ...(state.activity?.events ?? [])].slice(0, EVENT_RING);
  state = setBranch(state, ['activity', 'events'], events);
  broadcast('patch', { activity: { events } });
  persist();
}

/** Replace one branch of a state tree, returning a new object. */
function setBranch(root, path, value) {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  return { ...root, [head]: setBranch(root?.[head] ?? {}, rest, value) };
}

/* ---------- SSE ---------- */

const clients = new Set();

function send(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    clients.delete(res);
  }
}

function broadcast(event, data) {
  for (const res of clients) send(res, event, data);
}

/* Comment pings keep the connection alive through idle timeouts and let a
   client notice a dead server promptly. */
setInterval(() => {
  for (const res of clients) {
    try { res.write(': ping\n\n'); } catch { clients.delete(res); }
  }
}, 15000).unref();

/* Twitch sends "#FF0000"; the bundled demo messages use palette names like
   "cyan". Pass a hex straight through and let anything else fall back. */
function normaliseChatColour(value) {
  const v = String(value ?? '').trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  return v || undefined;
}

/* The component draws one short badge, not a row of platform icons. Pick the
   one that actually changes how a message should read. */
const BADGE_RANK = [['broadcaster', 'HOST'], ['moderator', 'MOD'], ['vip', 'VIP'], ['subscriber', 'SUB']];
function chatBadge(badges) {
  if (!Array.isArray(badges)) return undefined;
  for (const [id, label] of BADGE_RANK) if (badges.includes(id)) return label;
  return undefined;
}

/* A live event owns the tile for its type from then on, so the demo name is
   replaced rather than sitting under a real stream. Types with no tile — raids,
   gift subs — simply have nowhere to land, which is fine. */
const TILE_FOR_KIND = { follower: 'follower', sub: 'sub', tip: 'tip' };
function updateTile(alert) {
  const key = TILE_FOR_KIND[alert?.kind ?? alert?.type];
  if (!key) return;
  const name = String(alert.name ?? '').slice(0, 40);
  if (!name) return;
  const amount = String(alert.amount ?? '').trim();
  const value = key === 'tip' && amount ? `${name} · ${amount}` : name;
  state = merge(state, { activity: { tiles: { [key]: { value, demo: false } } } });
  persist();
  broadcast('patch', { activity: { tiles: { [key]: { value, demo: false } } } });
}

/* ---------- integrations ----------
   A live source reaches the overlays through exactly the same three doors
   the dashboard uses, so nothing downstream can tell the difference between
   a follower Twitch reported and one typed by hand. */
const integrations = new Integrations({
  emitAlert(alert) {
    broadcast('alert', { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...alert });
    recordEvent(alert);
    updateTile(alert);
  },
  patch(patch) {
    state = merge(state, patch);
    persist();
    broadcast('patch', patch);
  },
  chat(line) {
    /* Normalise to the shape the chat component already renders, rather than
       inventing a second one — an integration that emitted its own field
       names would render as blank rows with no error anywhere. */
    const message = {
      author: String(line.user ?? line.author ?? '').slice(0, 40),
      text: String(line.text ?? '').slice(0, 300),
      /* A platform colour is a hex; the demo palette uses names. Both are
         allowed through and the component decides. */
      color: normaliseChatColour(line.colour ?? line.color),
      badge: chatBadge(line.badges),
      at: new Date().toTimeString().slice(0, 5),
    };
    if (!message.text) return;
    const cap = Math.max(1, Math.min(Number(state.chat?.maxMessages) || 12, 40));
    /* The first real message clears the demo seed. Leaving it would put
       invented viewers on stream next to actual ones, which is the single
       most embarrassing thing this overlay could do. */
    const existing = (state.chat?.messages ?? []).filter((m) => !m.demo);
    const messages = [message, ...existing].slice(0, cap);
    state = setBranch(state, ['chat', 'messages'], messages);
    persist();
    broadcast('patch', { chat: { messages } });
  },
  readState: () => state,
  log: (msg) => console.log(`  ${msg}`),
}, config, CREDENTIALS_FILE);

/* ---------- helpers ---------- */

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null); }
      catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

/* Uploads arrive as a raw body rather than multipart: one file per request,
   no parser, no dependency. */
function readRawBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(new Error('file too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/* One slot owns one file; changing format must not leave the old one behind
   for the asset probe to find. */
async function removeSlotFiles(slot) {
  let entries = [];
  try { entries = await readdir(ASSETS_DIR); } catch { return; }
  await Promise.all(entries
    .filter((name) => IMAGE_TYPES.some((t) => name === `${slot}.${t.ext}`))
    .map((name) => unlink(join(ASSETS_DIR, name)).catch(() => {})));
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',   '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',   '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.webm': 'video/webm',  '.ogg': 'audio/ogg',  '.mp3': 'audio/mpeg',
  '.woff2':'font/woff2',
};

/* ---------- request handling ---------- */

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const path = decodeURIComponent(url.pathname);

  /* --- API --- */

  if (path === '/api/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      /* Proxies that buffer would defeat the point of a stream. */
      'x-accel-buffering': 'no',
    });
    /* Retry hint: how long a dropped client waits before reconnecting. */
    res.write('retry: 2000\n\n');
    /* A page says what it is on connect, so a refresh can report how many OBS
       sources it actually reached rather than counting the dashboard asking. */
    res.jaRole = url.searchParams.get('role') === 'dashboard' ? 'dashboard' : 'scene';
    clients.add(res);
    /* A source that opens or refreshes gets the current state immediately,
       as its first event, with no request of its own. */
    send(res, 'state', state);
    req.on('close', () => clients.delete(res));
    return;
  }

  /* ---- integrations ---- */
  if (path === '/api/integrations' && req.method === 'GET') {
    json(res, 200, integrations.status());
    return;
  }

  /* POST /api/integrations/<id>/<connect|disconnect|rotate> */
  if (path.startsWith('/api/integrations/') && req.method === 'POST') {
    const [, , , id, action] = path.split('/');
    const integration = integrations.get(id);
    if (!integration) { json(res, 404, { error: `unknown source "${id}"` }); return; }
    try {
      if (action === 'connect') {
        const started = await integration.connect();
        json(res, 200, { ok: true, ...started, status: integration.status });
        return;
      }
      if (action === 'disconnect') {
        await integration.disconnect();
        json(res, 200, { ok: true, status: integration.status });
        return;
      }
      if (action === 'rotate' && typeof integration.rotate === 'function') {
        await integration.rotate();
        json(res, 200, { ok: true, status: integration.status });
        return;
      }
      json(res, 400, { error: `unknown action "${action}"` });
    } catch (err) {
      /* A failure here is nearly always something the operator can fix —
         a missing client id, a refused code — so say it in words. */
      integration.state = 'error';
      integration.detail = err.message;
      json(res, 400, { error: err.message });
    }
    return;
  }

  /* Anything that can POST can drive the overlay through the relay. */
  if (path.startsWith('/api/ingest/') && req.method === 'POST') {
    const key = path.slice('/api/ingest/'.length);
    const relay = integrations.get('relay');
    let body = null;
    try { body = await readBody(req); } catch (err) { json(res, 400, { error: err.message }); return; }
    const refusal = relay?.accept(key, body);
    if (refusal) { json(res, 400, { error: refusal }); return; }
    json(res, 200, { ok: true });
    return;
  }

  /* Tell every open source to reload itself.

     Settings travel over SSE, so nothing here is needed for those. This is for
     the other case: new CODE on disk, which a running page cannot pick up
     because it already parsed the old one. The alternative is OBS's "Refresh
     browser when scene becomes active", which pays a reload on every cut to
     solve a problem that happens after an update. */
  if (path === '/api/reload' && req.method === 'POST') {
    broadcast('reload', { at: Date.now() });
    const sources = [...clients].filter((c) => c.jaRole !== 'dashboard').length;
    json(res, 200, { ok: true, sources });
    return;
  }

  /* What build is actually running, versus what is on disk right now. */
  if (path === '/api/health' && req.method === 'GET') {
    const current = await sourceFingerprint();
    json(res, 200, {
      ok: true,
      running: BOOT_FINGERPRINT,
      onDisk: current,
      stale: current !== BOOT_FINGERPRINT,
      startedAt: STARTED_AT,
      schema: SCHEMA_VERSION,
    });
    return;
  }

  if (path === '/api/state' && req.method === 'GET') {
    json(res, 200, state);
    return;
  }

  if (path === '/api/state' && req.method === 'POST') {
    try {
      const patch = await readBody(req);
      state = merge(state, patch);
      persist();
      /* Broadcast the patch, not the whole snapshot: clients apply the same
         merge, so every client converges on identical state. */
      broadcast('patch', patch);
      json(res, 200, { ok: true });
    } catch (err) {
      json(res, 400, { error: err.message });
    }
    return;
  }

  if (path === '/api/alert' && req.method === 'POST') {
    try {
      const alert = await readBody(req);
      /* Alerts are events, not settings: broadcast, and never written to
         state.json, so a restarted overlay never replays yesterday's
         followers. */
      broadcast('alert', { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...alert });
      recordEvent(alert);
      json(res, 200, { ok: true });
    } catch (err) {
      json(res, 400, { error: err.message });
    }
    return;
  }

  /* ---- branding uploads ---- */
  if (path.startsWith('/api/branding/') && req.method === 'POST') {
    const [, , , slot, action] = path.split('/');

    if (!BRANDING_SLOTS.has(slot)) {
      json(res, 400, { error: `unknown slot "${slot}"` });
      return;
    }

    /* POST /api/branding/<slot>/clear — back to the CSS fallback. */
    if (action === 'clear') {
      await removeSlotFiles(slot);
      state = merge(state, { branding: { [slot]: null } });
      persist();
      broadcast('patch', { branding: { [slot]: null } });
      json(res, 200, { ok: true, slot, file: null });
      return;
    }

    try {
      const body = await readRawBody(req, MAX_UPLOAD);
      if (body.length === 0) { json(res, 400, { error: 'empty upload' }); return; }

      const type = sniffImage(body);
      if (!type) {
        json(res, 415, { error: 'not a PNG, JPEG or WebP image' });
        return;
      }

      await mkdir(ASSETS_DIR, { recursive: true });
      await removeSlotFiles(slot);
      const file = `${slot}.${type.ext}`;
      await writeFile(join(ASSETS_DIR, file), body);

      /* updatedAt doubles as a cache-buster in the URL the client builds. */
      const entry = { file, updatedAt: Date.now(), bytes: body.length };
      state = merge(state, { branding: { [slot]: entry } });
      persist();
      broadcast('patch', { branding: { [slot]: entry } });
      json(res, 200, { ok: true, slot, ...entry });
    } catch (err) {
      json(res, err.message === 'file too large' ? 413 : 400, { error: err.message });
    }
    return;
  }

  /* ---- theme reset ---- */
  if (path === '/api/theme/reset' && req.method === 'POST') {
    const theme = defaults(config).theme;
    /* Replace rather than merge: a reset must clear values, not layer over them. */
    state = { ...state, theme };
    persist();
    broadcast('patch', { theme });
    json(res, 200, { ok: true, theme });
    return;
  }

  /* Reset one branch of state: /api/reset/chat, /api/reset/alerts.tip, ... */
  if (path.startsWith('/api/reset/') && req.method === 'POST') {
    const branch = decodeURIComponent(path.slice('/api/reset/'.length));
    if (!/^[\w.]+$/.test(branch)) { json(res, 400, { error: 'bad branch' }); return; }
    const fresh = branch.split('.').reduce((acc, key) => acc?.[key], defaults(config));
    if (fresh === undefined) { json(res, 404, { error: `no defaults for "${branch}"` }); return; }
    const patch = branch.split('.').reverse().reduce((acc, key) => ({ [key]: acc }), fresh);
    /* Replace the branch outright so removed keys do not survive the reset. */
    state = setBranch(state, branch.split('.'), fresh);
    persist();
    broadcast('state', state);
    json(res, 200, { ok: true, branch, value: fresh });
    return;
  }

  if (path === '/api/reset' && req.method === 'POST') {
    /* Uploaded artwork is the user's own and is never destroyed by a settings
       reset — only the explicit per-slot Clear removes a file. */
    const branding = state.branding;
    state = { ...initialState(), branding };
    persist();
    broadcast('state', state);
    json(res, 200, { ok: true });
    return;
  }

  /* --- static files --- */

  try {
    const target = join(ROOT, normalize(path === '/' ? '/dashboard.html' : path));
    if (!target.startsWith(ROOT + sep) && target !== ROOT) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(target);
    const file = info.isDirectory() ? join(target, 'index.html') : target;
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      /* OBS's embedded browser caches hard. A stale copy of one script while
         the rest of the package has moved on breaks the page in a way that
         looks identical to the server being down, so refuse caching outright
         rather than relying on the source being refreshed by hand. */
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      pragma: 'no-cache',
      expires: '0',
    });
    res.end(body);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    } else {
      res.writeHead(500, { 'content-type': 'text/plain' }).end('Server error');
      console.error(err);
    }
  }
});

await loadPersisted();

/* A hidden auto-start server plus a manually launched one is an easy mistake
   to make. Say so plainly instead of printing a stack trace into a log file
   nobody is watching. */
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`
  Port ${PORT} is already in use — the overlay server is most likely
  already running (check with status.bat, stop it with stop.bat).

  Nothing to do: your browser sources are already being served.
`);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'your-machine-ip' : HOST;
  const base = `http://${shown}:${PORT}`;
  console.log(`
  ${productLine}  —  by ${brand.studio}
  serving ${ROOT}

  Dashboard      ${base}/dashboard.html
                 (an OBS dock or any browser — Chrome, Edge, another machine
                  on your LAN if you started with --host 0.0.0.0)

  Scenes         ${base}/scenes/gameplay.html
                 ${base}/scenes/starting-soon.html
                 ${base}/scenes/just-chatting.html
                 ${base}/scenes/brb.html
                 ${base}/scenes/ending.html
                 ${base}/scenes/offline.html

  This server owns overlay state and pushes changes to every connected
  source over SSE. Settings persist to state.json. Ctrl-C to stop.
`);

  /* Anything linked before the last shutdown comes back on its own. A
     streamer should not have to reconnect Twitch because they rebooted. */
  integrations.resume().catch((err) => console.error('  integrations:', err.message));
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    integrations.stopAll().finally(() => process.exit(0));
  });
}
