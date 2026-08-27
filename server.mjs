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

   SSE + POST rather than WebSockets: EventSource is native to every
   browser, server-side SSE is a few lines of plain http, and the
   package stays dependency-free.

   Usage:  node server.mjs [port] [--host 0.0.0.0]
   ============================================================ */

import { createServer } from 'node:http';
import { readFile, writeFile, stat, mkdir, readdir, unlink } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
/* Where settings persist. Overridable with --state so a second instance —
   the acceptance suite, or a test profile — cannot fight the live server over
   the same file. */
const STATE_FILE = (() => {
  const i = process.argv.indexOf('--state');
  return i !== -1 && process.argv[i + 1] ? resolve(process.argv[i + 1]) : join(ROOT, 'state.json');
})();

const args = process.argv.slice(2);
const stateFlag = args.indexOf('--state');
/* Skip the value that follows --state when hunting for the port. */
const PORT = Number(args.find((a, i) => /^\d+$/.test(a) && i !== stateFlag + 1)) || 8787;
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

function initialState() {
  return {
    channel:  { ...config.channel },
    stream:   { ...config.stream },
    caffeine: { ...config.caffeine },
    goals:    structuredClone(config.goals),
    activity: structuredClone(config.activity),
    modules:  { ...config.modules },
    display:  { ...config.display },
    theme:    { ...config.theme },
    branding: { ...config.branding },
    chat:     { messages: [...config.chat.demoMessages], maxMessages: config.chat.maxMessages },
  };
}

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
    state = merge(initialState(), saved);
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
      await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (err) {
      console.error('  could not write state.json:', err.message);
    }
  }, 250);
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
    clients.add(res);
    /* A source that opens or refreshes gets the current state immediately,
       as its first event, with no request of its own. */
    send(res, 'state', state);
    req.on('close', () => clients.delete(res));
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
      /* Alerts are events, not state: broadcast, never persisted, so a
         reconnecting source never replays yesterday's followers. */
      broadcast('alert', { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...alert });
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
    const theme = { ...config.theme };
    state = merge(state, { theme });
    persist();
    broadcast('patch', { theme });
    json(res, 200, { ok: true, theme });
    return;
  }

  if (path === '/api/reset' && req.method === 'POST') {
    state = initialState();
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
  JON_AI_CTRL stream package  —  serving ${ROOT}

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
});
