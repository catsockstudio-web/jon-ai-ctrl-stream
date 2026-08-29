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
  gameplay:     { x: 32, y: 775, width: 400,  height: 225 },
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

/* ---------- 5. shipped OBS camera masks ----------
   Gameplay's overlay is transparent everywhere, so it cannot crop the camera
   the way Just Chatting's opaque ground does. The mask in obs/ is what gives
   the camera the frame's rounded corners, so it must keep matching the
   opening it was generated from. */
{
  const masks = [
    ['obs/camera-mask-gameplay.png', OPENINGS.gameplay],
    ['obs/camera-mask-just-chatting.png', OPENINGS.justChatting],
  ];
  for (const [file, o] of masks) {
    const page = await context.newPage();
    await page.setViewportSize({ width: o.width, height: o.height });
    await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block}</style>
      <img src="${BASE}/${file}">`);
    await page.waitForTimeout(500);

    const size = await page.locator('img').evaluate((el) => ({ w: el.naturalWidth, h: el.naturalHeight }));
    check(`${file}: matches the opening size`, size.w === o.width && size.h === o.height, `${size.w}x${size.h} vs ${o.width}x${o.height}`);

    const centre = await sample(page, o.width / 2, o.height / 2);
    check(`${file}: interior passes the camera`, centre.a === 255, `alpha=${centre.a}`);

    /* Top-right carries the 20px radius; it must be cut away or the camera
       shows a square corner outside the frame's rounded border. */
    const corner = await sample(page, o.width - 3, 2);
    check(`${file}: 20px corner is masked off`, corner.a === 0, `alpha=${corner.a}`);
    await page.close();
  }
}

/* ---------- 6. optional assets actually paint ----------
   Checking for the `has-asset` class is not enough, and once was not: a
   url() inside a custom property resolves against the stylesheet rather than
   the document, so the class went on, the placeholder hid, and the slot
   painted nothing. Only a pixel proves it. */
{
  const { writeFileSync, rmSync } = await import('node:fs');
  const { deflateSync } = await import('node:zlib');

  /* A solid magenta PNG, distinct from anything in the palette. */
  const [W, H] = [512, 512];
  const rgb = [255, 0, 255];
  const raw = Buffer.concat(Array.from({ length: H }, () =>
    Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: W }, () => rgb).flat())])));
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(body) >>> 0 : crc32(body) >>> 0);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    return Buffer.concat([len, body, crc]);
  };
  /* Minimal CRC32, so the test needs nothing beyond node:zlib. */
  function crc32(buf) {
    let c, crc = 0xffffffff;
    for (let n = 0; n < buf.length; n += 1) {
      c = (crc ^ buf[n]) & 0xff;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crc = c ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);

  const target = new URL('../assets/mascot.png', import.meta.url);
  let preexisting = false;
  try { (await import('node:fs')).accessSync(target); preexisting = true; } catch { /* none */ }

  if (preexisting) {
    console.log('SKIP  asset override — assets/mascot.png already exists, not overwriting it');
  } else {
    writeFileSync(target, png);
    /* The file is written into *this checkout*. When BASE points at a server
       serving a different directory — the extracted client package, say — the
       server cannot see it, and the checks below would report a product bug
       that is really just a misdirected fixture. Ask the server first. */
    const visible = await fetch(`${BASE}/assets/mascot.png`).then((r) => r.ok).catch(() => false);
    if (!visible) {
      console.log('SKIP  asset override — the server under test serves a different directory');
    } else {
      const page = await open('/scenes/starting-soon.html');
      const slot = await page.locator('.ja-mascot').evaluate((n) => {
        const r = n.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height * 0.6,
                 hasAsset: n.classList.contains('has-asset'),
                 url: getComputedStyle(n).backgroundImage };
      });
      check('asset override sets the class', slot.hasAsset);
      check('asset URL resolves against the document, not the stylesheet',
        !/\/src\/assets\//.test(slot.url), slot.url.slice(0, 60));

      const p = await sample(page, slot.x, slot.y);
      check('the asset actually paints in the slot',
        p.r > 230 && p.g < 40 && p.b > 230, `rgb(${p.r},${p.g},${p.b})`);
      await page.close();
    }
    rmSync(target);
  }
}

await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
