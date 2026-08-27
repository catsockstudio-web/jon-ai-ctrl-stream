#!/usr/bin/env node
/* ============================================================
   server.mjs — a zero-dependency static server for the package.

   Why a server at all: the control page and the browser sources talk
   over BroadcastChannel, and browsers only let pages on the same
   origin do that. Opening the files directly (file://) gives each
   page an opaque origin, so the control page could not reach OBS —
   and ES modules do not load from file:// either. Serving the folder
   on localhost fixes both, costs nothing, and needs no install.

   Usage:  node server.mjs [port]
   ============================================================ */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.argv[2]) || 8787;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.ogg':  'audio/ogg',
  '.mp3':  'audio/mpeg',
  '.woff2':'font/woff2',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/control.html';

    /* Keep requests inside the package directory. */
    const target = join(ROOT, normalize(pathname));
    if (!target.startsWith(ROOT + sep) && target !== ROOT) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const info = await stat(target);
    const file = info.isDirectory() ? join(target, 'index.html') : target;
    const body = await readFile(file);

    res.writeHead(200, {
      'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      /* Overlays are edited and reloaded constantly; never serve a stale one. */
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

server.listen(PORT, '127.0.0.1', () => {
  const base = `http://127.0.0.1:${PORT}`;
  console.log(`
  JON_AI_CTRL stream package

  Control page   ${base}/control.html

  Scenes         ${base}/scenes/gameplay.html
                 ${base}/scenes/starting-soon.html
                 ${base}/scenes/just-chatting.html
                 ${base}/scenes/brb.html
                 ${base}/scenes/ending.html
                 ${base}/scenes/offline.html

  All sources are 1920 x 1080 unless noted in README.md.
  Ctrl-C to stop.
`);
});
