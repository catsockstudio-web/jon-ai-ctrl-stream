/* ============================================================
   paginate.mjs — where each section actually starts.

   The contents page carries real page numbers, so they have to be
   measured rather than estimated. An earlier version divided each
   section's height by the page height, which ignores figures and
   tables that refuse to split: it was one page out by the end, and
   a contents page that is one out is worse than none.

   So every section is rendered to its own PDF and its pages
   counted. Sections always start on a new page, which makes the
   running total exact by construction. Chromium does the
   pagination either way, so this agrees with the real document.

   Usage:  node paginate.mjs        prints the table
           node paginate.mjs --fix  rewrites the contents numbers
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile, writeFile, unlink } from 'node:fs/promises';

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const DIR = dirname(fileURLToPath(import.meta.url));

const html = await readFile(join(DIR, 'manual.html'), 'utf8');
/* `@page :first { margin: 0 }` exists for the cover, and the cover really is
   the first page. Every other section is not — but in a solo render it would
   be, silently taking the full-bleed margins, measuring taller, and reporting
   fewer pages than the real document. So the rule is kept for the cover and
   dropped for everything after it. */
const headFull = html.slice(0, html.indexOf('</head>') + 7);
const headInner = headFull.replace(/@page :first \{[^}]*\}/, '');

const browser = await chromium.launch();
const page = await browser.newPage();

/** Pages in a PDF, counted from its own page objects. */
const countPages = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;

/* Split on top-level sections. Each begins on a new page in the real
   document, so rendering one alone gives exactly its own page count. */
const parts = html.split(/(?=<section)/).filter((p) => p.startsWith('<section'));

const scratch = join(DIR, '.paginate-section.html');
const rows = [];
let at = 1;
for (const part of parts) {
  const body = part.slice(0, part.lastIndexOf('</section>') + 10);
  const title = /<h2[^>]*>(.*?)<\/h2>/s.exec(body)?.[1]?.replace(/<[^>]+>/g, '').trim()
    ?? (body.includes('class="cover"') ? 'cover' : 'untitled');
  /* Written as a real file beside the manual rather than pushed in with
     setContent: a setContent document has no URL, so Chromium refuses its
     file:// images and every figure collapses. The section then measures
     short and the whole table is confidently wrong. */
  const head = rows.length === 0 ? headFull : headInner;
  await writeFile(scratch, `${head}<body>${body}</body></html>`);
  await page.goto(`file://${scratch}`, { waitUntil: 'load' });
  await page.evaluate(() => Promise.all(
    [...document.images].map((img) => (img.complete ? null : img.decode().catch(() => null)))));
  const broken = await page.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).length);
  if (broken) throw new Error(`${broken} image(s) did not load — the count would be wrong`);
  const pdf = await page.pdf({
    format: 'Letter', printBackground: true,
    margin: { top: '16mm', bottom: '18mm', left: '15mm', right: '15mm' },
  });
  const n = countPages(pdf);
  rows.push({ title, startsAt: at, pages: n });
  at += n;
}
await browser.close();
await unlink(scratch).catch(() => {});

console.log(`total ${at - 1} pages`);
for (const r of rows) console.log(`  p${String(r.startsAt).padStart(2)}  (${r.pages}pp)  ${r.title}`);

/* --fix writes the measured numbers into the contents table, matching each
   row by its title rather than by position. */
if (process.argv.includes('--fix')) {
  let out = html;
  const updated = [];
  const missed = [];
  for (const r of rows) {
    if (r.title === 'cover' || /What is in this manual/.test(r.title)) continue;
    const escaped = r.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(<b>\\d+ · ${escaped}</b>[\\s\\S]*?<td>)p\\d+(</td>)`);
    if (re.test(out)) { out = out.replace(re, `$1p${r.startsAt}$2`); updated.push(r.title); }
    else missed.push(r.title);
  }
  await writeFile(join(DIR, 'manual.html'), out);
  console.log(`\ncontents updated: ${updated.length} rows`);
  /* A row whose heading does not match a contents entry keeps whatever number
     it had, which is the one way this script can leave a wrong number behind.
     Say so rather than reporting a clean run. */
  if (missed.length) {
    console.log(`NOT MATCHED — check these by hand: ${missed.join(', ')}`);
    process.exitCode = 1;
  }
}
