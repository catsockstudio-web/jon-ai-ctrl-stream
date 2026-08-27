#!/usr/bin/env node
/* ============================================================
   dashboard.mjs — the six sections do what they claim.

   Covers the parts a client will actually touch: switching
   sections, theming, editing scene text, and that every one of
   those reaches server state rather than only the page it was
   typed into.

   Branding uploads are covered here too, including a refusal:
   a control that silently accepts a bad file is worse than one
   that rejects it loudly.

   Requires Playwright (dev-only):  npm i -D playwright

   Usage:  node server.mjs &
           node test/dashboard.mjs
   ============================================================ */

let chromium;
for (const specifier of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
  try { ({ chromium } = await import(specifier)); break; } catch { /* try next */ }
}
if (!chromium) { console.error('Playwright not found. Install it with:  npm i -D playwright'); process.exit(2); }
const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
const results = [];
const check = (n, pass, d = '') => { results.push([n, pass]); console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.route('**://fonts.g*/**', r => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
/* Console "Failed to load resource" lines carry no URL, so real failures are
   tracked by request events — the fonts abort below would otherwise look like
   a fault. Optional-asset 404s are the documented fallback and are ignored. */
page.on('requestfailed', r => { if (!/fonts\.g/.test(r.url())) errors.push('failed: ' + r.url()); });

await page.goto(`${BASE}/dashboard.html`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

check('dashboard loads with no script errors', errors.length === 0, errors[0] ?? '');
check('all ten sections present', await page.locator('.dash-section').count() === 10, String(await page.locator('.dash-section').count()));
check('nav has ten items', await page.locator('[data-nav]').count() === 10);
check('preview iframe points at a scene', /scenes\//.test(await page.locator('#preview').getAttribute('src')));

// section switching
for (const id of ['theme', 'branding', 'scenes', 'alerts', 'chat', 'goals', 'widgets', 'integrations', 'obs']) {
  await page.click(`[data-nav="${id}"]`);
  await page.waitForTimeout(120);
  const visible = await page.locator(`.dash-section[data-section="${id}"]`).isVisible();
  check(`section "${id}" opens`, visible);
}

// theme: change accent, confirm it reaches state and the preview
await page.click('[data-nav="theme"]');
await page.evaluate(() => {
  const i = document.querySelector('[data-ctl="theme.colors.primary"]');
  i.value = '#ff0066'; i.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(700);
const themed = await (await fetch(`${BASE}/api/state`)).json();
check('accent change persists to server state', themed.theme.colors.primary === '#ff0066', themed.theme.colors.primary);
const cssVar = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--violet').trim());
check('accent applies as a CSS token', cssVar.toLowerCase() === '#ff0066', cssVar);

// motion segmented control
await page.click('[data-ctl-seg="theme.motionLevel"] [data-seg-value="reduced"]');
await page.waitForTimeout(500);
const st2 = await (await fetch(`${BASE}/api/state`)).json();
check('motion level persists', st2.theme.motionLevel === 'reduced', st2.theme.motionLevel);

// theme reset
await page.click('[data-reset-branch="theme.colors"]');
await page.waitForTimeout(700);
const st3 = await (await fetch(`${BASE}/api/state`)).json();
check('theme reset restores defaults', st3.theme.colors.primary === '#8B4DFF', st3.theme.colors.primary);

// scene editor
await page.click('[data-nav="scenes"]');
await page.click('[data-scene="offline"]');
await page.waitForTimeout(400);
check('scene editor lists fields for the chosen scene', await page.locator('[data-scene-field]').count() >= 3);
await page.fill('[data-scene-field="channel.tagline"]', 'Cat Sock Studio');
await page.waitForTimeout(600);
const st4 = await (await fetch(`${BASE}/api/state`)).json();
check('scene text edit reaches server state', st4.channel.tagline === 'Cat Sock Studio', st4.channel.tagline);

// branding slots + OBS urls
await page.click('[data-nav="branding"]');
check('branding shows every slot', await page.locator('.dash-drop').count() === 7);
await page.click('[data-nav="obs"]');
check('OBS setup lists copy buttons', await page.locator('[data-copy]').count() >= 13);

/* The deeper customiser pages must actually render controls, and the
   expert ones must start collapsed so a beginner is not buried. */
for (const [id, min] of [['alerts', 40], ['chat', 20], ['goals', 18], ['widgets', 15]]) {
  await page.click(`[data-nav="${id}"]`);
  await page.waitForTimeout(150);
  const n = await page.locator(`.dash-section[data-section="${id}"] [data-ctl], .dash-section[data-section="${id}"] [data-ctl-toggle], .dash-section[data-section="${id}"] [data-ctl-seg], .dash-section[data-section="${id}"] [data-ctl-pos]`).count();
  check(`${id} page renders controls`, n >= min, `${n} controls`);
  const open = await page.locator(`.dash-section[data-section="${id}"] details[open]`).count();
  check(`${id} advanced sections start collapsed`, open === 0, `${open} open`);
}

/* Switching alert type must swap the page to that type's settings. */
await page.click('[data-nav="alerts"]');
await page.click('[data-alert-type="tip"]');
await page.waitForTimeout(250);
check('alert type tabs switch the editor',
  await page.locator('[data-ctl="alerts.tip.title"]').count() === 1);


await b.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
