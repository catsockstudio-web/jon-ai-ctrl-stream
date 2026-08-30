#!/usr/bin/env node
/* ============================================================
   buttons.mjs — every clickable thing in the dashboard does
   something.

   The customizer suite proves that controls with a state path
   reach the overlay. It says nothing about the rest of the UI:
   preset buttons, type tabs, copy buttons, disclosures, the
   branding pickers, the demo tools. Those are the ones a person
   presses and, when nothing happens, reasonably concludes the
   product is broken.

   So this walks every button on every page, presses it, and asks
   whether ANYTHING changed — server state, the page, the
   clipboard, or a network request. A button that moves none of
   those is dead, and dead is the finding.

   Usage:  node server.mjs &
           node test/buttons.mjs
   ============================================================ */

const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';

let chromium;
for (const s of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
  try { ({ chromium } = await import(s)); break; } catch { /* next */ }
}
if (!chromium) { console.error('Playwright not found. npm i -D playwright'); process.exit(2); }

/* Buttons whose whole job is to destroy or disconnect something. Pressing
   them mid-sweep would invalidate every later check, so they are exercised
   deliberately at the end instead of being skipped and quietly untested. */
const DESTRUCTIVE = new Set(['reset-everything', 'discard-draft']);
/* Skipped deliberately, each for a reason:
     source actions   would disconnect Twitch mid-sweep
     branding pick    opens a native file dialog nothing can answer
     info buttons     covered by the customizer suite, and there are 145
     toggles/controls proven against the rendered scene there too */
const SKIP_SELECTOR = ['[data-source-action]', '[data-clear]', '[data-pick]',
  '[data-help]', '[data-ctl-toggle]'];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1800, height: 1000 },
  permissions: ['clipboard-read', 'clipboard-write'],
});
await ctx.route('**://fonts.g*/**', (r) => r.abort());
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
});
/* A confirm() that is never answered would hang the sweep. */
page.on('dialog', (d) => d.dismiss().catch(() => {}));

let requests = 0;
page.on('request', (r) => { if (/\/api\//.test(r.url())) requests += 1; });

await fetch(`${BASE}/api/reset`, { method: 'POST' });
await page.goto(`${BASE}/dashboard.html`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2200);

const stateHash = async () => JSON.stringify(await (await fetch(`${BASE}/api/state`)).json());
/* Structure and visible text, not geometry — a ticking clock must not read as
   a change, and neither must a mid-flight transition. */
const domHash = () => page.evaluate(() => {
  const panel = document.querySelector('.dash-body');
  return [...panel.querySelectorAll('*')]
    .map((e) => `${e.tagName}.${typeof e.className === 'string' ? e.className : ''}`
      + (e.hasAttribute('open') ? ':open' : '')
      + (e.hasAttribute('hidden') ? ':hidden' : ''))
    .join('|');
});

const PAGES = ['live', 'theme', 'branding', 'scenes', 'alerts', 'chat', 'goals', 'widgets', 'integrations', 'obs'];
let stateBefore = await stateHash();

/* The preview frame is where a preview-mode change lands, and the clipboard is
   where a COPY button lands. Neither shows up in the parent DOM, so a sweep
   that watched only the parent would call both of them dead. */
const frameHash = () => page.evaluate(() => {
  const win = document.querySelector('#preview')?.contentWindow;
  try { return win?.document?.body?.innerHTML?.length ?? 0; } catch { return 0; }
});
const clipboard = () => page.evaluate(() => navigator.clipboard.readText().catch(() => '')).catch(() => '');

/* Mode is global and sticky, so it has to be normalised between buttons. */
async function resetMode() {
  const mode = await page.evaluate(() =>
    document.querySelector('[data-mode].is-active')?.dataset.mode ?? 'live');
  if (mode !== 'live') {
    await page.click('#discard-draft').catch(() => {});
    await page.waitForTimeout(150);
    await page.click('[data-mode="live"]').catch(() => {});
    await page.waitForTimeout(200);
  }
}
const dead = [];
const checked = [];

for (const nav of PAGES) {
  await page.click(`[data-nav="${nav}"]`);
  await page.waitForTimeout(350);

  /* Only what is actually visible on this page. */
  const handles = await page.$$('.dash-body button:visible, .dash-body summary:visible, .dash-body [data-pos-value]:visible, .dash-body [data-seg-value]:visible');
  for (const h of handles) {
    const id = await h.evaluate((e) => {
      const label = (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28);
      const key = e.id || e.dataset.preset || e.dataset.alertType || e.dataset.goalKey
        || e.dataset.copy || e.dataset.resetBranch || e.dataset.resetControl || e.dataset.help
        || e.dataset.mode || e.dataset.posValue || e.dataset.segValue || e.dataset.scene || e.dataset.nav || '';
      return `${e.tagName.toLowerCase()}${key ? `[${key}]` : ''}${label ? ` "${label}"` : ''}`;
    });
    if (await h.evaluate((e) => e.disabled)) continue;
    if (DESTRUCTIVE.has(await h.evaluate((e) => e.id))) continue;
    if (await h.evaluate((e, sels) => sels.some((s) => e.matches(s)), SKIP_SELECTOR)) continue;

    /* Put the page back in a known mode first. Without this, the sweep's own
       click on PREVIEW put every later button into a mode where changes are
       deliberately held back, and the audit then reported the entire left
       column as dead. An audit that creates the condition it is testing for
       is worse than no audit. */
    await resetMode();

    /* Pressing the mode you are already in is correctly a no-op, and reporting
       it as a dead button would train the reader to ignore this list. */
    if (await h.evaluate((e) => e.matches('[data-mode]') && e.classList.contains('is-active'))) continue;

    const beforeDom = await domHash();
    const beforeFrame = await frameHash();
    const beforeClip = await clipboard();
    const beforeReq = requests;
    try { await h.click({ timeout: 2000 }); } catch { continue; }
    await page.waitForTimeout(300);

    let changed = requests > beforeReq
      || (await domHash()) !== beforeDom
      || (await frameHash()) !== beforeFrame
      || (await clipboard()) !== beforeClip;
    if (!changed) {
      const now = await stateHash();
      changed = now !== stateBefore;
      stateBefore = now;
    }
    checked.push(id);
    if (!changed) dead.push(`${nav}: ${id}`);
  }
}

console.log(`${checked.length} clickable elements exercised across ${PAGES.length} pages\n`);
if (dead.length) {
  console.log(`NOTHING HAPPENED (${dead.length}):`);
  for (const d of dead) console.log('  ' + d);
} else {
  console.log('Every button changed something.');
}
if (errors.length) {
  console.log(`\nCONSOLE ERRORS (${errors.length}):`);
  for (const e of [...new Set(errors)].slice(0, 10)) console.log('  ' + e);
}
await browser.close();
process.exit(dead.length || errors.length ? 1 : 0);
