const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const DIR = '/tmp/claude-0/-home-user-valdenmoor/e884f9a3-1fa5-5a4a-b798-d6d02948124b/scratchpad/manual';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto(`file://${DIR}/manual.html`, { waitUntil: 'load' });
await p.waitForTimeout(1200);
await p.pdf({
  path: `${DIR}/JON_AI_CTRL - Setup and Operating Manual.pdf`,
  format: 'Letter',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: `<div style="width:100%;font-family:Helvetica,Arial,sans-serif;font-size:7pt;color:#8a8c96;padding:0 15mm;display:flex;justify-content:space-between">
      <span>JON_AI_CTRL Stream Package — Setup &amp; Operating Manual</span>
      <span class="pageNumber"></span></div>`,
  margin: { top: '16mm', bottom: '18mm', left: '15mm', right: '15mm' },
});
await b.close();
console.log('rendered');
