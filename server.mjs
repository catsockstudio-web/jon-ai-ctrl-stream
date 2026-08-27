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
import { readFile, writeFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const STATE_FILE = join(ROOT, 'state.json');

const args = process.argv.slice(2);
const PORT = Number(args.find((a) => /^\d+$/.test(a))) || 8787;
const hostFlag = args.indexOf('--host');
/* Localhost-only by default. Pass --host 0.0.0.0 deliberately to run the
   control page from another machine on your LAN. */
const HOST = hostFlag !== -1 ? (args[hostFlag + 1] ?? '127.0.0.1') : '127.0.0.1';

const MAX_BODY = 256 * 1024;

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

  if (path === '/api/reset' && req.method === 'POST') {
    state = initialState();
    persist();
    broadcast('state', state);
    json(res, 200, { ok: true });
    return;
  }

  /* --- static files --- */

  try {
    const target = join(ROOT, normalize(path === '/' ? '/control.html' : path));
    if (!target.startsWith(ROOT + sep) && target !== ROOT) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(target);
    const file = info.isDirectory() ? join(target, 'index.html') : target;
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
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

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'your-machine-ip' : HOST;
  const base = `http://${shown}:${PORT}`;
  console.log(`
  JON_AI_CTRL stream package  —  serving ${ROOT}

  Control page   ${base}/control.html
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
