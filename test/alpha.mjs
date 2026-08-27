#!/usr/bin/env node
/* ============================================================
   alpha.mjs — proves the camera openings are genuine holes.

   OBS composites the camera BELOW the browser source, so a camera
   is only visible where the overlay renders nothing at all. This
   suite samples real pixel alpha out of Chromium: the centre of
   each authored opening must be fully transparent, while the scene
   around it and the frame chrome over it must still render.

   It also composites a scene over a magenta backdrop in an iframe,
   which is the same stacking OBS performs, and confirms the backdrop
   shows through the opening and nowhere else.

   Requires Playwright (dev-only):  npm i -D playwright

   Usage:  node server.mjs &          # port 8787
           node test/alpha.mjs
   ============================================================ */

import zlib from 'node:zlib';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';

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

/* ---------- pixel sampling ----------
   Chromium writes colour type 6 (RGBA) when a region carries any
   transparency and colour type 2 (RGB) when it is fully opaque, so the
   IHDR has to be read rather than assumed. For a single pixel every PNG
   filter reduces to the raw bytes, so the filter byte is simply skipped. */
function decodePixel(buffer) {
  let offset = 8;
  let colourType = 6;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IHDR') colourType = buffer[offset + 8 + 9];
    if (type === 'IDAT') idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const hasAlpha = colourType === 6 || colourType === 4;
  return { r: raw[1], g: raw[2], b: raw[3], a: hasAlpha ? raw[4] : 255 };
}

async function sample(page, x, y) {
  const shot = await page.screenshot({
    omitBackground: true,                      // no white canvas behind the page
    clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 },
  });
  return decodePixel(shot);
}

const OPENINGS = {
  gameplay:     { x: 32, y: 791, width: 400,  height: 225 },
  justChatting: { x: 56, y: 300, width: 1160, height: 652 },
};
const centreOf = (o) => [o.x + o.width / 2, o.y + o.height / 2];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await context.route('**://fonts.g*/**', (route) => route.abort());

async function open(path) {
  const page = await context.newPage();
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  return page;
}

/* ---------- 1. Just Chatting ---------- */
{
  const o = OPENINGS.justChatting;
  const page = await open('/scenes/just-chatting.html');

  const centre = await sample(page, ...centreOf(o));
  check('Just Chatting: opening centre is fully transparent', centre.a === 0, `alpha=${centre.a}`);

  /* The designed dark background must survive everywhere else. */
  const above = await sample(page, 960, 120);
  const belowLeft = await sample(page, 960, 1000);
  check('Just Chatting: scene background still renders above the opening', above.a === 255, `alpha=${above.a}`);
  check('Just Chatting: scene background still renders below the opening', belowLeft.a === 255, `alpha=${belowLeft.a}`);

  /* Chrome that sits over the camera must still paint. */
  const nameplate = await sample(page, o.x + 60, o.y + o.height - 6);
  check('Just Chatting: nameplate renders over the opening', nameplate.a > 0, `alpha=${nameplate.a}`);

  /* The hole follows the frame's rounded corners, so the square region just
     outside a 20px corner must stay covered — otherwise camera bleeds past
     the border. */
  const outsideCorner = await sample(page, o.x + o.width - 3, o.y + 3);
  check('Just Chatting: rounded corner is not bled past', outsideCorner.a === 255, `alpha=${outsideCorner.a}`);

  /* Sensitivity: with the debug placeholder on, the centre must go opaque.
     If this ever passes while the check above also passes, the test is not
     actually measuring what it claims to. */
  await fetch(`${BASE}/api/state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ display: { showCameraPlaceholder: true } }),
  });
  await page.waitForTimeout(700);
  const withPlaceholder = await sample(page, ...centreOf(o));
  check('Just Chatting: placeholder ON makes the centre opaque (test is sensitive)', withPlaceholder.a === 255, `alpha=${withPlaceholder.a}`);

  await fetch(`${BASE}/api/state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ display: { showCameraPlaceholder: false } }),
  });
  await page.waitForTimeout(600);
  const restored = await sample(page, ...centreOf(o));
  check('Just Chatting: placeholder OFF restores the hole', restored.a === 0, `alpha=${restored.a}`);
  await page.close();
}

/* ---------- 2. Gameplay ---------- */
{
  const o = OPENINGS.gameplay;
  const page = await open('/scenes/gameplay.html');

  const centre = await sample(page, ...centreOf(o));
  check('Gameplay: opening centre is fully transparent', centre.a === 0, `alpha=${centre.a}`);

  const brandBar = await sample(page, 100, 70);
  check('Gameplay: brand bar still renders', brandBar.a > 0, `alpha=${brandBar.a}`);

  const nameplate = await sample(page, o.x + 60, o.y + o.height - 6);
  check('Gameplay: nameplate renders over the opening', nameplate.a > 0, `alpha=${nameplate.a}`);

  /* With the stand-in plate on, the rest of the canvas fills in but the
     camera opening must stay open so a camera can be positioned against it. */
  await fetch(`${BASE}/api/state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ display: { showSampleGameplay: true } }),
  });
  await page.waitForTimeout(700);
  const plateCentre = await sample(page, ...centreOf(o));
  const plateElsewhere = await sample(page, 960, 500);
  check('Gameplay: sample plate fills the canvas', plateElsewhere.a === 255, `alpha=${plateElsewhere.a}`);
  check('Gameplay: sample plate keeps the camera opening open', plateCentre.a === 0, `alpha=${plateCentre.a}`);

  await fetch(`${BASE}/api/state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ display: { showSampleGameplay: false } }),
  });
  await page.close();
}

/* ---------- 3. Standalone webcam module ---------- */
{
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 253 });
  await page.goto(`${BASE}/modules/webcam-frame.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const centre = await sample(page, 200, 112);
  check('Webcam module: interior is transparent', centre.a === 0, `alpha=${centre.a}`);
  const nameplate = await sample(page, 60, 219);
  check('Webcam module: nameplate renders', nameplate.a > 0, `alpha=${nameplate.a}`);
  await page.close();
}

/* ---------- 4. OBS-style composite ----------
   The scene in an iframe over a magenta backdrop, which is the stacking
   OBS performs: camera below, browser source above. */
{
  const o = OPENINGS.justChatting;
  const page = await context.newPage();
  await page.setContent(`
    <style>
      html, body { margin: 0; height: 100%; background: #FF00FF; }
      iframe { position: absolute; inset: 0; width: 1920px; height: 1080px; border: 0; background: transparent; }
    </style>
    <iframe src="${BASE}/scenes/just-chatting.html"></iframe>
  `);
  await page.waitForTimeout(1600);

  const isMagenta = (p) => p.r > 200 && p.b > 200 && p.g < 60;
  const throughHole = await sample(page, ...centreOf(o));
  const overScene = await sample(page, 960, 120);
  check('Composite: the layer below shows through the opening', isMagenta(throughHole), `rgb(${throughHole.r},${throughHole.g},${throughHole.b})`);
  check('Composite: the layer below is hidden everywhere else', !isMagenta(overScene), `rgb(${overScene.r},${overScene.g},${overScene.b})`);
  await page.close();
}

await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
