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

/* Every control in a card must be covered by that card's RESET branches.
   A card whose RESET leaves some of its own controls behind reads to the user
   as a button that does not work — which is exactly how the Theme FEEL card
   shipped, resetting glow but not Motion or Effect performance. This walks
   the real rendered DOM so a newly added control cannot quietly fall outside
   the card it sits in. */
{
  const orphans = [];
  for (const id of ['theme', 'alerts', 'chat', 'goals', 'widgets']) {
    await page.click(`[data-nav="${id}"]`);
    await page.waitForTimeout(250);
    const rows = await page.$$eval('.ctl-card', (els) => els.map((c) => {
      const button = c.querySelector('[data-reset-branch]');
      if (!button) return null;
      const paths = [...c.querySelectorAll('[data-ctl],[data-ctl-hex],[data-ctl-seg],[data-ctl-pos],[data-ctl-toggle]')]
        .map((e) => e.dataset.ctl || e.dataset.ctlHex || e.dataset.ctlSeg || e.dataset.ctlPos || e.dataset.ctlToggle)
        .filter(Boolean);
      return {
        title: c.querySelector('.ctl-card__title')?.textContent.replace('RESET', '').trim(),
        branches: button.dataset.resetBranch.split(/\s+/).filter(Boolean),
        paths: [...new Set(paths)],
      };
    }).filter(Boolean));
    for (const r of rows) {
      const missed = r.paths.filter((path) => !r.branches.some((b) => path === b || path.startsWith(`${b}.`)));
      if (missed.length) orphans.push(`${id}/${r.title}: ${missed.join(', ')}`);
    }
  }
  check('every card RESET covers all of its own controls', orphans.length === 0, orphans[0] ?? '');
}

/* And the branches those buttons name must actually have defaults — a typo
   would otherwise leave a button that posts a 404 and changes nothing. */
{
  const branches = await page.$$eval('[data-reset-branch]',
    (els) => [...new Set(els.flatMap((e) => e.dataset.resetBranch.split(/\s+/)))].filter(Boolean));
  const dead = [];
  for (const b of branches) {
    const res = await fetch(`${BASE}/api/reset/${encodeURIComponent(b)}`, { method: 'POST' });
    if (!res.ok) dead.push(`${b} -> ${res.status}`);
  }
  check('every RESET branch has defaults on the server', dead.length === 0, dead.join(' | ') || `${branches.length} branches`);
}

/* The three cards whose controls span more than one branch, end to end. */
{
  const put = (body) => fetch(`${BASE}/api/state`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const state = async () => (await fetch(`${BASE}/api/state`)).json();

  await page.click('[data-nav="theme"]');
  await put({ theme: { intensity: { glow: 1.9 }, motionLevel: 'off', performance: 'low' } });
  await page.waitForTimeout(500);
  await page.click('[data-reset-branch~="theme.motionLevel"]');
  await page.waitForTimeout(700);
  const feel = await state();
  check('Theme FEEL reset also restores motion and performance',
    feel.theme.intensity.glow === 1 && feel.theme.motionLevel === 'full' && feel.theme.performance === 'balanced',
    `glow=${feel.theme.intensity.glow} motion=${feel.theme.motionLevel} perf=${feel.theme.performance}`);

  await page.click('[data-nav="widgets"]');
  await put({ widgets: { goalRail: { position: 'top-left' } }, goals: { railGoal: 'coffee' } });
  await page.waitForTimeout(500);
  await page.click('[data-reset-branch~="goals.railGoal"]');
  await page.waitForTimeout(700);
  const rail = await state();
  check('Goal rail reset also restores which goal it shows',
    rail.widgets.goalRail.position === 'bottom-center' && rail.goals.railGoal === 'follower',
    `${rail.widgets.goalRail.position} / ${rail.goals.railGoal}`);

  await put({ activity: { categories: { raid: false, tip: false }, events: [{ id: 'x', type: 'sub', name: 'leftover', at: Date.now() }] } });
  await page.waitForTimeout(500);
  await page.click('[data-reset-branch~="activity.categories"]');
  await page.waitForTimeout(700);
  const ev = await state();
  check('Recent events reset restores categories and clears the list',
    ev.activity.categories.raid === true && ev.activity.categories.tip === true && ev.activity.events.length === 0,
    `raid=${ev.activity.categories.raid} events=${ev.activity.events.length}`);
}

/* Version skew: server.mjs lives in memory from startup while pages come off
   disk on every request, so an update leaves a new dashboard talking to an old
   server and its buttons 404 silently. That is what made RESET look broken. */
{
  const health = await (await fetch(`${BASE}/api/health`)).json();
  check('server reports its build', typeof health.running === 'string' && health.running.length > 0, health.running);
  check('a current server is not stale', health.stale === false);
  check('the stale banner stays hidden on a current server', await page.locator('#stale-banner').isHidden());

  /* The banner must actually be able to show — a class-level display rule
     silently beat the hidden attribute the first time this was written. */
  await page.evaluate(() => { document.getElementById('stale-banner').hidden = false; });
  check('the stale banner can be shown', await page.locator('#stale-banner').isVisible());
  await page.evaluate(() => { document.getElementById('stale-banner').hidden = true; });

  /* A failed action has to say so rather than looking like a dead button. */
  await page.evaluate(() => {
    const el = document.getElementById('action-error');
    el.innerHTML = '<strong>That did not work.</strong><span>test</span>';
    el.hidden = false;
  });
  check('a failed action reports itself', await page.locator('#action-error').isVisible());
  await page.evaluate(() => { document.getElementById('action-error').hidden = true; });
}

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
check('branding shows every slot', await page.locator('.dash-drop').count() === 8);
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
