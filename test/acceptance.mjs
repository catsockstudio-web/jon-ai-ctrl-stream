#!/usr/bin/env node
/* ============================================================
   acceptance.mjs — proves the transport actually crosses browsers.

   The critical detail: the control page and the overlays run in TWO
   SEPARATE CHROMIUM INSTANCES, not two tabs and not two contexts of
   one browser. Separate instances share no BroadcastChannel and no
   localStorage, so anything that passes here passed through the
   server. A same-browser test could not tell the two apart, which is
   exactly the hole this suite exists to close.

   Requires Playwright (dev-only; the package itself has no runtime
   dependencies):  npm i -D playwright   — or a global install.

   Usage:  node server.mjs &            # on 8788, see BASE below
           node test/acceptance.mjs
   ============================================================ */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rm } from 'node:fs/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8788;
const BASE = `http://127.0.0.1:${PORT}`;
const STATE_FILE = join(ROOT, 'state.acceptance.json');

/* Resolve Playwright from a local install, then a global one. */
let chromium;
for (const specifier of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
  try { ({ chromium } = await import(specifier)); break; } catch { /* try next */ }
}
if (!chromium) {
  console.error('Playwright not found. Install it with:  npm i -D playwright');
  process.exit(2);
}

const results = [];
const check = (name, pass, detail = '') => {
  results.push([name, pass]);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

/* ---------- server under test ---------- */

let server;
function startServer() {
  /* Its own state file: a live server on another port must not be able to
     write settings underneath this run. */
  server = spawn(process.execPath, [join(ROOT, 'server.mjs'), String(PORT), '--state', STATE_FILE],
    { cwd: ROOT, stdio: 'ignore' });
}
async function stopServer() {
  if (!server) return;
  server.kill('SIGKILL');
  await sleep(400);
  server = null;
}
async function waitForServer(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/state`);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await sleep(150);
  }
  throw new Error('server did not come up');
}

await rm(STATE_FILE, { force: true });
startServer();
await waitForServer();

/* ---------- two independent browsers ---------- */

const controlBrowser = await chromium.launch();   // stands in for Chrome/Edge
const obsBrowser     = await chromium.launch();   // stands in for OBS's CEF

const controlCtx = await controlBrowser.newContext({ viewport: { width: 1440, height: 900 } });
const obsCtx     = await obsBrowser.newContext({ viewport: { width: 1920, height: 1080 } });
for (const ctx of [controlCtx, obsCtx]) await ctx.route('**://fonts.g*/**', (r) => r.abort());

const control = await controlCtx.newPage();
await control.goto(`${BASE}/dashboard.html`, { waitUntil: 'domcontentloaded' });

const scene = await obsCtx.newPage();
await scene.goto(`${BASE}/scenes/gameplay.html`, { waitUntil: 'domcontentloaded' });
await sleep(900);

/* Sanity: the two really are isolated. If this ever fails, every result
   below is suspect, because a shared channel could explain them. */
await control.evaluate(() => localStorage.setItem('isolation-probe', 'control-browser'));
const leaked = await scene.evaluate(() => localStorage.getItem('isolation-probe'));
check('browsers are isolated (no shared localStorage)', leaked === null, `scene saw: ${leaked}`);

/* ---------- 1. control -> scene ---------- */

const before = await scene.locator('[data-bind="uptime"]').textContent();
await control.click('#go-live');
await sleep(1500);
const after = await scene.locator('[data-bind="uptime"]').textContent();
check('START STREAM in browser A starts the clock in browser B', before === '--:--:--' && /^00:00:0\d$/.test(after), `${before} -> ${after}`);

await control.fill('#topic', 'Cross-browser transport');
await sleep(600);
const chatting = await obsCtx.newPage();
await chatting.goto(`${BASE}/scenes/just-chatting.html`, { waitUntil: 'domcontentloaded' });
await sleep(800);
check('topic typed in A reaches a scene in B', (await chatting.content()).includes('Cross-browser transport'));

check('chat panel visible before toggle', await scene.locator('.ja-chat').count() === 1);
/* Chat's own enable lives on the Chat page; open it first. */
await control.click('[data-nav="chat"]');
await sleep(250);
await control.click('[data-ctl-toggle="chat.enabled"]');
await sleep(600);
check('module toggle in A hides the panel in B', await scene.locator('.ja-chat').count() === 0);
await control.click('[data-ctl-toggle="chat.enabled"]');
await sleep(400);
/* Goals are back on Live Control. */
await control.click('[data-nav="live"]');
await sleep(200);

await control.fill('[data-goal="follower.current"]', '250');
await sleep(700);
check('goal edit in A moves the rail in B',
  (await scene.locator('.ja-goal__fill').getAttribute('style')).includes('width:100.0%'));

/* ---------- 2. alerts ---------- */

await control.fill('#alert-name', 'cross_browser');
await control.click('[data-alert="follower"]');
await sleep(700);
const alertCount = await scene.locator('.ja-alert').count();
check('alert fired in A appears in B', alertCount === 1 && (await scene.locator('.ja-alert').textContent()).includes('cross_browser'), `${alertCount} card(s)`);
check('alert fires exactly once (no local echo double-up)', alertCount === 1);

await sleep(5400);
check('alert clears after its 5s life', await scene.locator('.ja-alert').count() === 0);

/* ---------- 3. late join and refresh ---------- */

const late = await obsCtx.newPage();
await late.goto(`${BASE}/modules/activity-tiles.html`, { waitUntil: 'domcontentloaded' });
await sleep(800);
check('a source opened later gets current state immediately',
  (await late.locator('.ja-tile').first().textContent()).includes('cross_browser'));

await scene.reload({ waitUntil: 'domcontentloaded' });
await sleep(900);
check('a refreshed source gets current state immediately',
  (await scene.locator('.ja-tile').first().textContent()).includes('cross_browser'));

/* ---------- 4. no localStorage dependency ---------- */

const sceneKeys = await scene.evaluate(() => Object.keys(localStorage));
check('scenes store nothing in localStorage', sceneKeys.length === 0, `keys: ${JSON.stringify(sceneKeys)}`);

/* ---------- 5. server restart ---------- */

await stopServer();
await sleep(600);
startServer();
await waitForServer();
/* EventSource reconnects on its own and the server answers with a snapshot;
   no reload of the source is performed here on purpose. */
await sleep(4000);

check('config survives a server restart',
  (await scene.locator('.ja-tile').first().textContent()).includes('cross_browser'));
check('goal survives a server restart',
  (await scene.locator('.ja-goal__fill').getAttribute('style')).includes('width:100.0%'));

await control.fill('#topic', 'Reconnected and still driving');
await sleep(900);
check('control still drives scenes after a restart (SSE reconnected)',
  (await chatting.content()).includes('Reconnected and still driving'));

/* ---------- server-pushed reload ----------
   Settings travel over SSE, so nothing needs refreshing for those. This is the
   other case: new code on disk, which a page that already parsed the old code
   cannot pick up. It exists so nobody has to tick OBS's "Refresh browser when
   scene becomes active", which pays a reload on every cut to solve a problem
   that only happens after an update. */
{
  let reloads = 0;
  chatting.on('load', () => { reloads += 1; });
  const before = reloads;

  const res = await fetch(`${BASE}/api/reload`, { method: 'POST' });
  const body = await res.json();
  await chatting.waitForTimeout(2000);

  check('a scene reloads when the server asks', reloads > before, `${before} -> ${reloads}`);
  check('the scene still mounts after reloading', (await chatting.locator('.stage').count()) === 1);
  check('the reload reports how many sources it reached', body.sources >= 1, `${body.sources} source(s)`);

  /* The count must mean OBS sources. Counting the dashboard would include the
     person who pressed the button, and a number that counts the asker is
     worse than no number. */
  const dash = await controlCtx.newPage();
  await dash.goto(`${BASE}/dashboard.html`, { waitUntil: 'domcontentloaded' });
  await dash.waitForTimeout(2000);
  const withDash = await (await fetch(`${BASE}/api/reload`, { method: 'POST' })).json();
  await dash.waitForTimeout(1200);
  check('the dashboard is not counted as a source', withDash.sources === body.sources + 1,
    `${body.sources} -> ${withDash.sources} (its preview frame is a scene, and counts)`);
  await dash.close();
}

/* ============================================================
   Graceful shutdown

   Stopping used to mean force-killing whatever held the port, which
   left any other server running and free to take the port later —
   the orphaned-process problem. The tray app and Stop Server.bat now
   stop the overlay by asking it to close, so that request has to
   actually end the process, and has to do it with browser sources
   still attached: an SSE stream nobody closes is exactly what would
   hold the listener open and turn "stop" into a hang.
   ============================================================ */
{
  check('server is up before the shutdown test',
    await fetch(`${BASE}/api/health`).then((r) => r.ok).catch(() => false));

  /* A page on any other site must not be able to end someone's broadcast. */
  const crossOrigin = await fetch(`${BASE}/api/shutdown`, {
    method: 'POST', headers: { origin: 'https://not-the-overlay.example' },
  });
  check('a cross-origin page cannot shut the overlay down', crossOrigin.status === 403,
    `HTTP ${crossOrigin.status}`);
  check('and it is still running afterwards',
    await fetch(`${BASE}/api/health`).then((r) => r.ok).catch(() => false));

  /* Two live sources attached, as during a stream. */
  const s1 = await obsCtx.newPage();
  const s2 = await obsCtx.newPage();
  await s1.goto(`${BASE}/scenes/gameplay.html`, { waitUntil: 'domcontentloaded' });
  await s2.goto(`${BASE}/scenes/brb.html`, { waitUntil: 'domcontentloaded' });
  await sleep(1200);

  const started = Date.now();
  const asked = await fetch(`${BASE}/api/shutdown`, { method: 'POST' }).then((r) => r.json());
  check('shutdown is accepted', asked.ok === true && asked.stopping === true);
  check('and it names the folder it stopped', typeof asked.root === 'string' && asked.root.length > 0);

  let gone = false;
  for (let i = 0; i < 40; i += 1) {
    await sleep(150);
    if (!(await fetch(`${BASE}/api/health`).then((r) => r.ok).catch(() => false))) { gone = true; break; }
  }
  check('the server actually stops, with sources still connected', gone,
    `${Date.now() - started} ms`);

  await s1.close().catch(() => {});
  await s2.close().catch(() => {});
  server = null;                 /* it stopped itself; nothing left to kill */
}

/* ---------- done ---------- */

await controlBrowser.close();
await obsBrowser.close();
await stopServer();
await rm(STATE_FILE, { force: true });

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
