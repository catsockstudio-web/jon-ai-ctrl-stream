#!/usr/bin/env node
/* ============================================================
   customizer.mjs — the controls actually reach the overlays.

   The point of this suite is the gap it closes: a control that
   exists in the dashboard but does not change what OBS renders is
   worse than no control at all. Every check here therefore reads
   the *scene*, not the dashboard — computed styles, classes and
   geometry on the page a browser source would load.

   Requires Playwright (dev-only):  npm i -D playwright
   Usage:  node test/customizer.mjs      (starts its own server)
   ============================================================ */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rm, writeFile } from 'node:fs/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8791;
const BASE = `http://127.0.0.1:${PORT}`;
const STATE_FILE = join(ROOT, 'state.customizer.json');

let chromium;
for (const s of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
  try { ({ chromium } = await import(s)); break; } catch { /* next */ }
}
if (!chromium) { console.error('Playwright not found. npm i -D playwright'); process.exit(2); }

const results = [];
const check = (name, pass, detail = '') => {
  results.push([name, pass]);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

/* ---------- server ---------- */
let server;
const startServer = () => { server = spawn(process.execPath, [join(ROOT, 'server.mjs'), String(PORT), '--state', STATE_FILE], { cwd: ROOT, stdio: 'ignore' }); };
/* Wait until the port genuinely stops answering. Returning while the old
   process still holds it means the next spawn dies with EADDRINUSE and the
   suite silently keeps testing the *old* server's state — which is exactly
   how the migration check produced a confident false result. */
const stopServer = async () => {
  server?.kill('SIGKILL');
  server = null;
  for (let i = 0; i < 40; i += 1) {
    try {
      await fetch(`${BASE}/api/state`, { signal: AbortSignal.timeout(300) });
      await sleep(100);
    } catch { return; }
  }
  throw new Error(`port ${PORT} did not free up`);
};
async function waitForServer(ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if ((await fetch(`${BASE}/api/state`)).ok) return; } catch { /* not yet */ }
    await sleep(150);
  }
  throw new Error('server did not start');
}
const patch = (body) => fetch(`${BASE}/api/state`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const getState = async () => (await fetch(`${BASE}/api/state`)).json();

await rm(STATE_FILE, { force: true });
startServer();
await waitForServer();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.route('**://fonts.g*/**', (r) => r.abort());

async function scene(path = '/scenes/gameplay.html') {
  const page = await ctx.newPage();
  page.__errors = [];
  page.on('console', async (m) => {
    if (m.type() !== 'error') return;
    const parts = [];
    for (const a of m.args()) { try { parts.push(String(await a.jsonValue())); } catch { parts.push(m.text()); } }
    const text = parts.join(' ');
    if (!/Failed to load resource/.test(text)) page.__errors.push(text);
  });
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  return page;
}

/* ============================================================
   1. Theme propagation and inheritance
   ============================================================ */
{
  const page = await scene();
  await patch({ theme: { colors: { primary: '#ff0066', secondary: '#00ff88' } } });
  await page.waitForTimeout(600);

  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { violet: cs.getPropertyValue('--violet').trim(), cyan: cs.getPropertyValue('--cyan').trim() };
  });
  check('theme colours propagate to a live overlay', tokens.violet === '#ff0066' && tokens.cyan === '#00ff88', JSON.stringify(tokens));

  /* An alert inheriting the theme should carry the theme's colour. */
  await fetch(`${BASE}/api/alert`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'follower', name: 'inherit_test' }) });
  await page.waitForTimeout(700);
  const inherited = await page.locator('.ja-alert').first().evaluate((n) => n.style.getPropertyValue('--alert-primary'));
  check('alert inherits the global theme', inherited === '#ff0066', inherited);

  /* Now override just that alert type. */
  await patch({ alerts: { follower: { useThemeColors: false, colors: { primary: '#123456' } } } });
  await page.waitForTimeout(400);
  await fetch(`${BASE}/api/alert`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'follower', name: 'override_test' }) });
  await page.waitForTimeout(6200);   /* let the first alert finish its 5s life */
  const overridden = await page.locator('.ja-alert').first().evaluate((n) => n.style.getPropertyValue('--alert-primary')).catch(() => '');
  check('widget override wins over the global theme', overridden === '#123456', overridden);

  /* Reset the override; it must fall back to the theme, not to the shipped default. */
  await fetch(`${BASE}/api/reset/alerts.follower`, { method: 'POST' });
  await page.waitForTimeout(6500);
  await fetch(`${BASE}/api/alert`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'follower', name: 'fallback_test' }) });
  await page.waitForTimeout(800);
  const fellBack = await page.locator('.ja-alert').first().evaluate((n) => n.style.getPropertyValue('--alert-primary')).catch(() => '');
  check('resetting an override falls back to the theme', fellBack === '#ff0066', fellBack);
  await page.close();
}

/* ============================================================
   2. Alert effects, timing and the queue
   ============================================================ */
{
  await patch({ theme: { performance: 'high', motionLevel: 'full' } });
  const page = await scene();

  await patch({ alerts: { follower: { effects: { rgbSplit: { on: true }, scanlines: { on: true }, crt: { on: true } } } } });
  await page.waitForTimeout(500);
  await fetch(`${BASE}/api/alert`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'follower', name: 'fx_test' }) });
  await page.waitForTimeout(700);

  const classes = await page.locator('.ja-alert').first().evaluate((n) => [...n.classList].join(' '));
  check('effect toggles reach the rendered alert',
    /fx--rgb-split/.test(classes) && /fx--scanlines/.test(classes) && /fx--crt/.test(classes), classes.slice(0, 80));

  const count = await page.locator('.ja-alert').count();
  check('effects do not duplicate the alert', count === 1, `${count} card(s)`);

  /* Duration must stay what it was configured to be, effects or not. */
  await page.waitForTimeout(5200);
  check('alert clears on schedule with effects on', await page.locator('.ja-alert').count() === 0);

  await patch({ alerts: { follower: { duration: 1500 } } });
  await page.waitForTimeout(300);
  const t0 = Date.now();
  await fetch(`${BASE}/api/alert`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'follower', name: 'timing' }) });
  await page.waitForSelector('.ja-alert', { timeout: 3000 });
  await page.waitForSelector('.ja-alert', { state: 'detached', timeout: 6000 });
  const elapsed = Date.now() - t0;
  check('configured duration is honoured', elapsed > 1400 && elapsed < 3200, `${elapsed}ms for a 1500ms alert`);

  /* Fire several quickly: they must queue, never overlap. */
  for (let i = 0; i < 3; i += 1) {
    await fetch(`${BASE}/api/alert`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'follower', name: `queued_${i}` }) });
  }
  await page.waitForTimeout(600);
  check('queue shows one alert at a time', await page.locator('.ja-alert').count() === 1);
  await page.waitForTimeout(6000);
  await page.close();
}

/* ============================================================
   3. Performance presets and the motion gate
   ============================================================ */
{
  await patch({ alerts: { follower: { duration: 5000, effects: { crt: { on: true }, noise: { on: true }, glow: { on: true } } } }, theme: { performance: 'low' } });
  const page = await scene();
  await fetch(`${BASE}/api/alert`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'follower', name: 'low_perf' }) });
  await page.waitForTimeout(800);
  const low = await page.locator('.ja-alert').first().evaluate((n) => [...n.classList].join(' '));
  check('LOW performance drops expensive effects', !/fx--crt|fx--noise/.test(low) && /fx--glow/.test(low), low.slice(0, 70));
  await page.waitForTimeout(5400);

  await patch({ theme: { performance: 'high', motionLevel: 'off' } });
  await page.waitForTimeout(400);
  await fetch(`${BASE}/api/alert`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'follower', name: 'motion_off' }) });
  await page.waitForTimeout(800);
  const off = await page.locator('.ja-alert').first().evaluate((n) => [...n.classList].join(' '));
  const gate = await page.evaluate(() => document.documentElement.dataset.motion);
  check('Motion Off drops animated effects but keeps static ones', gate === '0' && !/fx--noise|fx--crt/.test(off) && /fx--glow/.test(off), `motion=${gate} ${off.slice(0, 60)}`);
  /* Glow is the one baseline effect: LOW performance and Motion Off together
     must still leave it on, or the cheapest settings look like a broken
     overlay rather than a cheap one. */
  await patch({ theme: { performance: 'low', motionLevel: 'off' } });
  await page.waitForTimeout(400);
  await fetch(`${BASE}/api/alert`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'follower', name: 'baseline' }) });
  await page.waitForTimeout(800);
  const floor = await page.locator('.ja-alert').first().evaluate((n) => [...n.classList].join(' '));
  check('glow survives the strictest performance and motion settings', /fx--glow/.test(floor), floor.slice(0, 60));

  /* Switching it off by hand still switches it off — baseline is a floor
     against the automatic gates, not an override of the operator. */
  await patch({ alerts: { follower: { effects: { glow: { on: false } } } } });
  await page.waitForTimeout(5600);
  await fetch(`${BASE}/api/alert`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'follower', name: 'glow_off' }) });
  await page.waitForTimeout(800);
  const noGlow = await page.locator('.ja-alert').first().evaluate((n) => [...n.classList].join(' '));
  check('turning glow off by hand still turns it off', !/fx--glow/.test(noGlow), noGlow.slice(0, 60));
  await patch({ alerts: { follower: { effects: { glow: { on: true } } } }, theme: { performance: 'balanced', motionLevel: 'full' } });
  await page.waitForTimeout(5400);
  await page.close();
}

/* ============================================================
   4. Chat customisation
   ============================================================ */
{
  await patch({ chat: { typography: { size: 30, family: 'mono', weight: 700 }, mode: 'transparent', maxMessages: 4, position: 'bottom-left', scale: 1.2 } });
  const page = await scene();
  const present = await page.locator('.ja-chat').count();
  if (!present) {
    const st = await getState();
    const diag = await page.evaluate(() => ({
      stage: document.querySelector('.stage')?.innerHTML.length ?? -1,
      chatEnabled: window.__jonAiCtrl?.store?.state?.chat?.enabled,
      msgs: window.__jonAiCtrl?.store?.state?.chat?.messages?.length,
      html: (document.querySelector('.stage')?.innerHTML ?? '').slice(0, 200),
      widgets: JSON.stringify(window.__jonAiCtrl?.store?.state?.widgets),
    }));
    check('chat panel is on the scene', false,
      `\n      console: ${page.__errors.slice(0, 2).join(' || ').slice(0, 300)}`);
  } else {
  const chat = await page.locator('.ja-chat').first().evaluate((n) => {
    const msg = n.querySelector('.ja-chat__msg');
    const cs = msg ? getComputedStyle(msg) : null;
    return {
      size: cs?.fontSize, weight: cs?.fontWeight, family: cs?.fontFamily ?? '',
      transparent: n.classList.contains('ja-chat--transparent'),
      messages: n.querySelectorAll('.ja-chat__msg').length,
    };
  });
  check('chat font size propagates', chat.size === '30px', chat.size);
  check('chat font weight propagates', chat.weight === '700', chat.weight);
  check('chat font family propagates', /mono|JetBrains/i.test(chat.family), chat.family.slice(0, 40));
  check('chat transparent mode propagates', chat.transparent === true);
  check('chat max messages is respected', chat.messages <= 4, `${chat.messages} shown`);
  }
  await page.close();
}

/* ============================================================
   5. Goals — orientation, alignment, sub-elements
   ============================================================ */
{
  await patch({ goals: { items: { follower: { orientation: 'vertical', thickness: 18, elements: { percentage: false, label: false } } } } });
  const page = await scene('/modules/goal-rail.html');
  const goal = await page.locator('.ja-goal').first().evaluate((n) => ({
    vertical: n.classList.contains('ja-goal--vertical'),
    thickness: getComputedStyle(n.querySelector('.ja-goal__rail')).width,
    labelText: n.querySelector('.ja-goal__label')?.textContent ?? '',
    valueText: n.querySelector('.ja-goal__value')?.textContent ?? '',
  }));
  check('goal vertical orientation propagates', goal.vertical === true);
  check('goal thickness propagates', goal.thickness === '18px', goal.thickness);
  check('goal sub-element toggles hide parts', goal.labelText === '', `label="${goal.labelText}"`);

  await patch({ goals: { items: { follower: { orientation: 'horizontal', elements: { label: true, percentage: true } } } } });
  await page.waitForTimeout(500);
  const horiz = await page.locator('.ja-goal').first().evaluate((n) => n.classList.contains('ja-goal--horizontal'));
  check('goal horizontal orientation propagates', horiz === true);
  await page.close();
}

/* ============================================================
   6. Widget position and scale presets
   ============================================================ */
{
  await patch({ alerts: { follower: { position: 'bottom-right', scale: 1.4 } } });
  const page = await scene();
  await fetch(`${BASE}/api/alert`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'follower', name: 'pos_test' }) });
  await page.waitForTimeout(800);
  const box = await page.locator('.ja-alert').first().boundingBox();
  const holder = await page.locator('.ja-alert-layer > div').first().evaluate((n) => n.style.cssText);
  check('alert position preset applies', /bottom:\s*32px/.test(holder) && /right:\s*32px/.test(holder), holder.slice(0, 70));
  check('scaled alert stays inside 1920x1080',
    box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 1921 && box.y + box.height <= 1081,
    box ? `x${Math.round(box.x)} y${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}` : 'no box');
  await page.waitForTimeout(5400);
  await page.close();
}

/* ============================================================
   7. Resets
   ============================================================ */
{
  await patch({ chat: { typography: { size: 33 } }, theme: { colors: { primary: '#010203' } } });
  await fetch(`${BASE}/api/reset/chat`, { method: 'POST' });
  const afterWidget = await getState();
  check('widget reset restores that widget only',
    afterWidget.chat.typography.size === 20 && afterWidget.theme.colors.primary === '#010203',
    `chat=${afterWidget.chat.typography.size} theme=${afterWidget.theme.colors.primary}`);

  await fetch(`${BASE}/api/reset`, { method: 'POST' });
  const afterAll = await getState();
  check('full reset restores everything', afterAll.theme.colors.primary === '#8B4DFF' && afterAll.chat.typography.size === 20);
}

/* ============================================================
   8. Migration and persistence
   ============================================================ */
{
  await stopServer();
  /* A realistic v1 document, as an existing install would have on disk. */
  await writeFile(STATE_FILE, JSON.stringify({
    theme: { accent: '#abcdef', accentAlt: '#fedcba', glow: 1.3, background: 0.8, motion: 'reduced' },
    modules: { chat: false, goalRail: true },
    goals: { follower: { current: 777, target: 1000, label: 'LEGACY GOAL' } },
    channel: { wordmark: 'LEGACY_NAME' },
    branding: { mascot: { file: 'mascot.png', updatedAt: 42 } },
  }));
  startServer();
  await waitForServer();
  const migrated = await getState();
  check('v1 state migrates without loss',
    migrated.version === 2 &&
    migrated.theme.colors.primary === '#abcdef' &&
    migrated.theme.motionLevel === 'reduced' &&
    migrated.goals.items.follower.current === 777 &&
    migrated.channel.wordmark === 'LEGACY_NAME' &&
    migrated.chat.enabled === false &&
    migrated.branding.mascot?.file === 'mascot.png',
    `v${migrated.version} primary=${migrated.theme.colors.primary} goal=${migrated.goals.items.follower.current}`);

  await patch({ theme: { colors: { primary: '#5566ff' } }, chat: { typography: { size: 26 } } });
  await sleep(600);
  await stopServer();
  startServer();
  await waitForServer();
  const restored = await getState();
  check('customisation survives a server restart',
    restored.theme.colors.primary === '#5566ff' && restored.chat.typography.size === 26,
    `${restored.theme.colors.primary} / ${restored.chat.typography.size}px`);

  /* A v2 document written before a setting existed must gain that setting at
     its default and keep every choice already made — otherwise shipping a new
     control would mean either a version bump or a reset for existing users. */
  await stopServer();
  const aged = JSON.parse(await (await import('node:fs/promises')).readFile(STATE_FILE, 'utf8'));
  delete aged.activity.categories;
  delete aged.activity.mode;
  aged.channel.wordmark = 'KEEP_ME';
  await writeFile(STATE_FILE, JSON.stringify(aged));
  startServer();
  await waitForServer();
  const topped = await getState();
  check('a same-version document gains new settings without losing old ones',
    topped.activity.mode === 'tiles' &&
    topped.activity.categories?.follower === true &&
    topped.channel.wordmark === 'KEEP_ME' &&
    topped.theme.colors.primary === '#5566ff',
    `mode=${topped.activity.mode} wordmark=${topped.channel.wordmark}`);

  /* The early-v2 category key was "follow". The choice must carry over rather
     than silently reverting to on. */
  await stopServer();
  const oldKey = JSON.parse(await (await import('node:fs/promises')).readFile(STATE_FILE, 'utf8'));
  oldKey.activity.categories = { follow: false, sub: true };
  await writeFile(STATE_FILE, JSON.stringify(oldKey));
  startServer();
  await waitForServer();
  const renamed = await getState();
  check('the renamed follower category carries its old value',
    renamed.activity.categories.follower === false && renamed.activity.categories.follow === undefined,
    JSON.stringify(renamed.activity.categories));
}

/* ============================================================
   9. Two isolated clients stay synchronised
   ============================================================ */
{
  const other = await chromium.launch();
  const otherCtx = await other.newContext({ viewport: { width: 1920, height: 1080 } });
  await otherCtx.route('**://fonts.g*/**', (r) => r.abort());
  const a = await scene();
  const bPage = await otherCtx.newPage();
  await bPage.goto(`${BASE}/scenes/gameplay.html`, { waitUntil: 'domcontentloaded' });
  await bPage.waitForTimeout(900);

  const leaked = await bPage.evaluate(() => localStorage.length);
  check('second browser shares no local storage', leaked === 0, `${leaked} keys`);

  await patch({ theme: { colors: { primary: '#0abcde' } } });
  await a.waitForTimeout(700); await bPage.waitForTimeout(700);
  const read = (p) => p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--violet').trim());
  check('both isolated clients receive the change', (await read(a)) === '#0abcde' && (await read(bPage)) === '#0abcde');
  await other.close();
  await a.close();
}

/* ============================================================
   10. Recent events list
   ============================================================ */
{
  const fire = (body) => fetch(`${BASE}/api/alert`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  await fetch(`${BASE}/api/reset/activity.events`, { method: 'POST' });
  await patch({ activity: {
    mode: 'list', maxEvents: 3, compact: false,
    elements: { icon: true, label: true, timestamp: true },
    categories: { follower: true, sub: true, tip: true, bits: true, raid: true, giftSub: true },
  } });

  const page = await scene();
  const rows = () => page.$$eval('.ja-event', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));

  check('an empty list draws nothing', (await page.locator('.ja-events').count()) === 0);

  for (const [kind, extra] of [['follower', {}], ['tip', { amount: '$5.00' }], ['raid', { count: '42' }]]) {
    await fire({ kind, name: `${kind}_user`, ...extra });
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(600);

  const listed = await rows();
  check('alerts land in the recent-events list', listed.length === 3, String(listed.length));
  check('newest event is first', /raid_user/.test(listed[0] ?? ''), listed[0] ?? '');
  check('the row carries the type\'s own wording', /raided/.test(listed[0] ?? '') && /tipped/.test(listed[1] ?? ''), (listed[1] ?? '').slice(0, 40));
  check('type detail is templated in', /42 viewers/.test(listed[0] ?? '') && /\$5\.00/.test(listed[1] ?? ''), listed[0] ?? '');

  /* Each type takes its own accent, so the list is scannable by colour. */
  const accents = await page.$$eval('.ja-event', (els) => els.map((e) => e.style.getPropertyValue('--event-accent')));
  check('each event row carries its type accent', new Set(accents).size > 1, accents.join(' '));

  /* maxEvents trims the visible list without losing the history. */
  await patch({ activity: { maxEvents: 1 } });
  await page.waitForTimeout(500);
  check('maxEvents trims the list', (await rows()).length === 1);
  await patch({ activity: { maxEvents: 3 } });
  await page.waitForTimeout(500);
  check('raising maxEvents brings the history back', (await rows()).length === 3);

  /* A category switched off hides events already on screen. */
  await patch({ activity: { categories: { raid: false } } });
  await page.waitForTimeout(500);
  const filtered = await rows();
  check('a category toggle filters the live list', filtered.length === 2 && !filtered.some((r) => /raided/.test(r)), String(filtered.length));
  await patch({ activity: { categories: { raid: true } } });
  await page.waitForTimeout(400);

  /* Timestamps and icons are real sub-element toggles, not decoration. */
  await patch({ activity: { elements: { timestamp: false, icon: false } } });
  await page.waitForTimeout(500);
  const stripped = await page.evaluate(() => ({
    ago: document.querySelectorAll('.ja-event__ago').length,
    icon: document.querySelectorAll('.ja-event__icon').length,
  }));
  check('event sub-element toggles reach the overlay', stripped.ago === 0 && stripped.icon === 0, JSON.stringify(stripped));
  await patch({ activity: { elements: { timestamp: true, icon: true } } });
  await page.waitForTimeout(400);

  /* Compact mode is a real height change, not a class nobody reads. */
  const tall = await page.locator('.ja-event').first().evaluate((n) => n.getBoundingClientRect().height);
  await patch({ activity: { compact: true } });
  await page.waitForTimeout(500);
  const short = await page.locator('.ja-event').first().evaluate((n) => n.getBoundingClientRect().height);
  check('compact rows are shorter', short < tall, `${tall} -> ${short}`);
  await patch({ activity: { compact: false } });
  await page.waitForTimeout(400);

  /* Switching back to tiles must restore the tiles, not leave the scene empty. */
  await patch({ activity: { mode: 'tiles' } });
  await page.waitForTimeout(500);
  check('switching back to tiles restores the tiles',
    (await page.locator('.ja-tile').count()) > 0 && (await page.locator('.ja-event').count()) === 0);
  await patch({ activity: { mode: 'list' } });
  await page.waitForTimeout(400);

  /* The standalone module must draw the list identically to the scene. */
  const mod = await ctx.newPage();
  await mod.setViewportSize({ width: 798, height: 480 });
  await mod.goto(`${BASE}/modules/activity-tiles.html`, { waitUntil: 'domcontentloaded' });
  await mod.waitForTimeout(900);
  const modWidth = await mod.locator('.ja-events').evaluate((n) => Math.round(n.getBoundingClientRect().width)).catch(() => -1);
  const sceneWidth = await page.locator('.ja-events').evaluate((n) => Math.round(n.getBoundingClientRect().width));
  check('the module draws the list at the same size as the scene', modWidth === sceneWidth, `${modWidth} vs ${sceneWidth}`);
  await mod.close();

  /* Ten rows at full size must not leave the frame. */
  await patch({ activity: { maxEvents: 10 } });
  for (let i = 0; i < 12; i += 1) await fire({ kind: 'sub', name: `filler_${i}`, tier: 'TIER 3' });
  await page.waitForTimeout(900);
  const escaped = await page.$$eval('.ja-event', (els) => els.filter((e) => {
    const r = e.getBoundingClientRect();
    return r.right > window.innerWidth + 0.5 || r.bottom > window.innerHeight + 0.5 || r.top < -0.5 || r.left < -0.5;
  }).length);
  check('a full list stays inside the frame', escaped === 0, `${await page.locator('.ja-event').count()} rows`);

  /* The ring is session history: it must not be written to disk. */
  const onDisk = JSON.parse(await (await import('node:fs/promises')).readFile(STATE_FILE, 'utf8'));
  check('recent events are never persisted', Array.isArray(onDisk.activity?.events) && onDisk.activity.events.length === 0,
    `${onDisk.activity?.events?.length} on disk`);

  await fetch(`${BASE}/api/reset/activity.events`, { method: 'POST' });
  await page.waitForTimeout(500);
  check('RESET clears the list', (await page.locator('.ja-event').count()) === 0);

  await patch({ activity: { mode: 'tiles' } });
  await page.close();
}

/* ============================================================
   11. Nothing broke: scenes render, camera stays transparent
   ============================================================ */
{
  await fetch(`${BASE}/api/reset`, { method: 'POST' });
  await sleep(400);
  for (const path of ['/scenes/gameplay.html', '/scenes/starting-soon.html', '/scenes/just-chatting.html', '/scenes/brb.html', '/scenes/ending.html', '/scenes/offline.html']) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    const mounted = await page.locator('.stage').count();
    check(`scene renders: ${path.split('/').pop()}`, mounted === 1 && errors.length === 0, errors[0] ?? '');
    await page.close();
  }

  /* The camera opening must still be a genuine hole after all of this. */
  const page = await scene();
  const shot = await page.screenshot({ omitBackground: true, clip: { x: 232, y: 887, width: 1, height: 1 } });
  const zlib = await import('node:zlib');
  let off = 8, ct = 6; const idat = [];
  while (off < shot.length) {
    const len = shot.readUInt32BE(off); const type = shot.toString('ascii', off + 4, off + 8);
    if (type === 'IHDR') ct = shot[off + 17];
    if (type === 'IDAT') idat.push(shot.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const alpha = (ct === 6 || ct === 4) ? raw[4] : 255;
  check('webcam opening is still transparent', alpha === 0, `alpha=${alpha}`);
  await page.close();
}

await browser.close();
await stopServer();
await rm(STATE_FILE, { force: true });

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
