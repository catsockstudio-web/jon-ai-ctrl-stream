#!/usr/bin/env node
/* ============================================================
   render.mjs — every page loads and mounts, with no script errors.

   The cheapest check that would have caught the two worst faults
   this package has had: a module contract change blanking every
   scene, and a stale script doing the same. It does not judge how
   a page looks — alpha.mjs and the overlap scan do that.

   Requires Playwright (dev-only):  npm i -D playwright

   Usage:  node server.mjs &
           node test/render.mjs
   ============================================================ */

const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';

let chromium;
for (const specifier of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
  try { ({ chromium } = await import(specifier)); break; } catch { /* try next */ }
}
if (!chromium) { console.error('Playwright not found. Install it with:  npm i -D playwright'); process.exit(2); }

/* [name, path, width, height, selector that proves it mounted] */
const PAGES = [
  ['dashboard',     '/dashboard.html',              1600, 1000, '.dash-panel'],
  ['gameplay',      '/scenes/gameplay.html',        1920, 1080, '.stage'],
  ['starting-soon', '/scenes/starting-soon.html',   1920, 1080, '.stage'],
  ['just-chatting', '/scenes/just-chatting.html',   1920, 1080, '.stage'],
  ['brb',           '/scenes/brb.html',             1920, 1080, '.stage'],
  ['ending',        '/scenes/ending.html',          1920, 1080, '.stage'],
  ['offline',       '/scenes/offline.html',         1920, 1080, '.stage'],
  ['m-brand-bar',   '/modules/brand-bar.html',       344,   76, '.stage'],
  ['m-system',      '/modules/system-strip.html',    420,   44, '.stage'],
  ['m-chat',        '/modules/chat.html',            360,  680, '.stage'],
  ['m-webcam',      '/modules/webcam-frame.html',    400,  253, '.stage'],
  ['m-tiles',       '/modules/activity-tiles.html',  798,   70, '.stage'],
  ['m-goal',        '/modules/goal-rail.html',      1856,   30, '.stage'],
  ['m-alerts',      '/modules/alerts.html',          720,  132, '.stage'],
];

const browser = await chromium.launch();
let failures = 0;

for (const [name, path, width, height, selector] of PAGES) {
  const context = await browser.newContext({ viewport: { width, height } });
  /* Fonts are the only external dependency; block them so the run is
     offline-deterministic and a slow CDN cannot look like a failure. */
  await context.route('**://fonts.g*/**', (route) => route.abort());
  const page = await context.newPage();

  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    if (!/fonts\.g/.test(r.url())) problems.push(`failed: ${r.url()}`);
  });

  /* A 404 for an optional asset is the documented fallback, not a fault. */
  const notFound = [];
  page.on('response', (r) => { if (r.status() === 404) notFound.push(r.url().replace(BASE, '')); });

  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 10000 })
    .catch((e) => problems.push(`goto: ${e.message}`));
  await page.waitForTimeout(900);

  const mounted = await page.locator(selector).count();
  const ok = problems.length === 0 && mounted === 1;
  if (!ok) failures += 1;

  const optional = notFound.filter((u) => u.startsWith('/assets/'));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(14)} ${selector}=${mounted}` +
    (optional.length ? `  optional-assets=[${optional.join(', ')}]` : '') +
    (problems.length ? `  ${problems.join(' | ')}` : ''));
  await context.close();
}

/* control.html is a stub that should send people to the dashboard. */
{
  const page = await browser.newPage();
  await page.goto(`${BASE}/control.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const ok = /dashboard\.html/.test(page.url());
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${'control→dash'.padEnd(14)} ${page.url().replace(BASE, '')}`);
  await page.close();
}

await browser.close();
console.log(failures === 0 ? '\nAll pages render clean.' : `\n${failures} page(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
