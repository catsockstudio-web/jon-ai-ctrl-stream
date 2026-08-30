#!/usr/bin/env node
/* ============================================================
   make-icon.mjs — generates obs/nightwire.ico for the tray app.

   Committed as a generator rather than a binary so the icon can be
   re-made when the brand colours move, and so nothing in the repo
   is a blob no one can edit.

   Each size is drawn at its own resolution rather than downscaled
   from one big bitmap: a 16px tray icon made by shrinking a 256px
   one turns to mush, and the tray is where it is seen most.

   Usage:  node tools/make-icon.mjs
   ============================================================ */

import { deflateSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Brand colours, matching src/css/tokens.css. */
const INK = [10, 10, 15];
const PURPLE = [139, 77, 255];
const CYAN = [34, 230, 224];

const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/* --- PNG ---------------------------------------------------- */

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i += 1) {
    let c = (crc ^ buf[i]) & 0xFF;
    for (let j = 0; j < 8; j += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const tag = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tag, data])));
  return Buffer.concat([len, tag, data, crc]);
}

/** RGBA pixel buffer -> PNG (colour type 6, 8-bit). */
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;

  const rows = [];
  for (let y = 0; y < size; y += 1) {
    rows.push(Buffer.from([0]));                       /* filter: none */
    rows.push(rgba.subarray(y * size * 4, (y + 1) * size * 4));
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --- the mark ----------------------------------------------- */

/* A rounded dark tile with a thick gradient diagonal across it — the "wire".
   Deliberately one bold shape: at 16 pixels anything finer is a smudge. */
function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const inset = size * 0.06;
  const lo = inset;
  const hi = size - inset;

  /* Distance outside a rounded rectangle, for a 1px antialiased edge. */
  const outside = (x, y) => {
    const cx = Math.max(lo + radius - x, 0, x - (hi - radius));
    const cy = Math.max(lo + radius - y, 0, y - (hi - radius));
    return Math.hypot(cx, cy) - radius;
  };

  /* Perpendicular distance to the diagonal stroke, drawn corner to corner. */
  const strokeHalf = size * 0.105;
  const distToDiagonal = (x, y) => {
    const ax = size * 0.30, ay = size * 0.70;
    const bx = size * 0.70, by = size * 0.30;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sx = x + 0.5, sy = y + 0.5;
      const i = (y * size + x) * 4;

      const tileAlpha = Math.max(0, Math.min(1, 0.5 - outside(sx, sy)));
      if (tileAlpha <= 0) continue;

      let [r, g, b] = INK;

      /* Gradient runs across the diagonal so both brand colours show. */
      const strokeAlpha = Math.max(0, Math.min(1, 0.5 + (strokeHalf - distToDiagonal(sx, sy))));
      if (strokeAlpha > 0) {
        const t = Math.max(0, Math.min(1, (sx + (size - sy)) / (size * 2)));
        const [pr, pg, pb] = lerp(PURPLE, CYAN, t);
        r = Math.round(r + (pr - r) * strokeAlpha);
        g = Math.round(g + (pg - g) * strokeAlpha);
        b = Math.round(b + (pb - b) * strokeAlpha);
      }

      px[i] = r; px[i + 1] = g; px[i + 2] = b;
      px[i + 3] = Math.round(255 * tileAlpha);
    }
  }
  return px;
}

/* --- ICO ---------------------------------------------------- */

/* Vista and later accept PNG-compressed entries, which keeps the file small
   and the 256px entry sane. Windows 10/11 only, which is what the package
   targets anyway. */
const SIZES = [16, 24, 32, 48, 64, 128, 256];

/**
 * One icon entry in the classic DIB form: BITMAPINFOHEADER, a bottom-up
 * 32-bit BGRA image, then a 1-bit AND mask.
 *
 * Not PNG, despite PNG entries being legal since Vista and far smaller.
 * Explorer reads those happily — the desktop shortcut rendered fine — but
 * System.Drawing.Icon, which is what the tray loads the file with, does not
 * reliably accept them and throws instead. An icon that works everywhere
 * except the one place it is actually needed is worth the extra bytes.
 */
function dib(size, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);            /* header size */
  header.writeInt32LE(size, 4);           /* width */
  header.writeInt32LE(size * 2, 8);       /* height: image + mask, per spec */
  header.writeUInt16LE(1, 12);            /* planes */
  header.writeUInt16LE(32, 14);           /* bits per pixel */
  header.writeUInt32LE(0, 16);            /* BI_RGB, uncompressed */

  /* Bottom-up rows, and BGRA rather than RGBA. */
  const image = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const src = (size - 1 - y) * size * 4;
    for (let x = 0; x < size; x += 1) {
      const s = src + x * 4;
      const d = (y * size + x) * 4;
      image[d]     = rgba[s + 2];         /* B */
      image[d + 1] = rgba[s + 1];         /* G */
      image[d + 2] = rgba[s];             /* R */
      image[d + 3] = rgba[s + 3];         /* A */
    }
  }

  /* The AND mask is legacy: the alpha channel above is what actually gets
     used. It still has to be present and correctly sized, with each row
     padded to a 4-byte boundary, or the file is rejected as malformed. */
  const maskRow = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(maskRow * size);

  return Buffer.concat([header, image, mask]);
}

const images = SIZES.map((size) => ({ size, data: dib(size, draw(size)) }));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);              /* reserved */
header.writeUInt16LE(1, 2);              /* type: icon */
header.writeUInt16LE(images.length, 4);

let offset = 6 + images.length * 16;
const entries = [];
for (const img of images) {
  const e = Buffer.alloc(16);
  e[0] = img.size === 256 ? 0 : img.size;  /* 0 means 256 */
  e[1] = img.size === 256 ? 0 : img.size;
  e[2] = 0;                                /* palette */
  e[3] = 0;                                /* reserved */
  e.writeUInt16LE(1, 4);                   /* colour planes */
  e.writeUInt16LE(32, 6);                  /* bits per pixel */
  e.writeUInt32LE(img.data.length, 8);
  e.writeUInt32LE(offset, 12);
  entries.push(e);
  offset += img.data.length;
}

const ico = Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
const out = join(ROOT, 'obs', 'nightwire.ico');
await writeFile(out, ico);
console.log(`wrote ${out}  (${SIZES.join(', ')} px, ${(ico.length / 1024).toFixed(1)} KB)`);
