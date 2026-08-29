const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const DIR = '/tmp/claude-0/-home-user-valdenmoor/e884f9a3-1fa5-5a4a-b798-d6d02948124b/scratchpad/manual';
const b = await chromium.launch();
/* Letter content box: 279.4mm tall less 16mm top and 18mm bottom margin.
   Width 215.9 less 15+15. Measure at that exact CSS size so wrapping matches
   the PDF, then page-count each section — every section starts on a new page,
   so its own height is all that decides where the next one begins. */
const mm = 96 / 25.4;
const W = Math.round((215.9 - 30) * mm);
const H = (279.4 - 34) * mm;
const p = await b.newPage({ viewport: { width: W, height: Math.round(H) } });
await p.emulateMedia({ media: 'print' });
await p.goto(`file://${DIR}/manual.html`, { waitUntil: 'load' });
await p.waitForTimeout(1200);
const pages = await p.evaluate((H) => {
  const out = [];
  for (const s of document.querySelectorAll('body > section')) {
    const first = s.classList.contains('cover');
    out.push({ cover: first, h: s.getBoundingClientRect().height,
               n: first ? 1 : Math.max(1, Math.ceil(s.getBoundingClientRect().height / H)),
               title: s.querySelector('h2')?.textContent ?? 'cover' });
  }
  return out;
}, H);
let at = 1;
for (const s of pages) { s.startsAt = at; at += s.n; }
console.log(`total ${at - 1} pages`);
for (const s of pages) console.log(`  p${String(s.startsAt).padStart(2)}  (${s.n}pp)  ${s.title}`);
await b.close();
