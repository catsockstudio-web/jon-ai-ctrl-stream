#!/usr/bin/env node
/* ============================================================
   build-client-package.mjs

   Assembles the ZIP that goes to a client. The client needs no
   git, no terminal, and nothing installed beyond OBS — Setup.bat
   handles Node and the OBS scenes.

   Everything developer-facing (tests, tooling, the dev README,
   the git plumbing) is deliberately left out: a client should not
   have to work out which of eleven files to double-click.

   Usage:  node tools/build-client-package.mjs
   ============================================================ */

import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* A preset pre-fills a customer's wording so their package arrives wearing
   their name. It is data only — no forked code, so a fix reaches every build.
   `--preset jon` builds Jon's; no flag builds the product's own demo copy. */
const presetFlag = process.argv.indexOf('--preset');
const PRESET = presetFlag !== -1 ? process.argv[presetFlag + 1] : null;

const NAME = PRESET
  ? `Nightwire Stream Overlay (${PRESET})`
  : 'Nightwire Stream Overlay';
const OUT = join(ROOT, 'dist');
const STAGE = join(OUT, NAME);

/* What the client actually needs to run the overlays. */
const RUNTIME = ['server.mjs', 'config.js', 'dashboard.html', 'control.html', 'start-hidden.vbs', 'boot-check.js'];
const DIRS = ['scenes', 'modules', 'src', 'assets', 'obs'];
/* The client-facing wrappers, copied from client/ into the package root. */
const CLIENT = ['START HERE.html', 'Setup.bat', 'Start Server.bat', 'Server Status.bat', 'Stop Server.bat',
  'Nightwire - Setup and Operating Manual.pdf'];

/* Clear only this build's staging directory. Wiping all of dist/ meant
   building the preset deleted the product's zip and vice versa, so the two
   could never exist at once. */
await rm(STAGE, { recursive: true, force: true });
await mkdir(STAGE, { recursive: true });

for (const file of RUNTIME) await cp(join(ROOT, file), join(STAGE, file));
for (const dir of DIRS) {
  await cp(join(ROOT, dir), join(STAGE, dir), {
    recursive: true,
    /* Never ship the dev README from assets/, or a stale state file. */
    filter: (src) => !/[\\/](README\.md|state\.json|\.gitkeep)$/.test(src),
  });
}
for (const file of CLIENT) await cp(join(ROOT, 'client', file), join(STAGE, file));

/* Fold the preset into the staged config.
   Appended as a merge rather than patched into the literal above. An earlier
   version rewrote values line by line, which quietly destroyed `demoMessages`
   — a multi-line array whose first line was replaced and whose body was left
   orphaned. Appending a merge cannot mis-handle nested or multi-line values
   because it never parses the file at all. */
if (PRESET) {
  const presetFile = join(ROOT, 'presets', `${PRESET}.json`);
  let preset;
  try {
    preset = JSON.parse(await readFile(presetFile, 'utf8'));
  } catch {
    throw new Error(`No preset "${PRESET}" — expected ${presetFile}`);
  }
  for (const key of Object.keys(preset)) if (key.startsWith('_')) delete preset[key];

  const staged = join(STAGE, 'config.js');
  const text = await readFile(staged, 'utf8');
  const merged = text.replace(/\nexport default config;\s*$/, `

/* ============================================================
   Build-time preset: ${PRESET}
   Written by tools/build-client-package.mjs. Data only — it
   overwrites values above and introduces no new behaviour, so
   this build and the product build run identical code.
   ============================================================ */
(function applyPreset(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    const nested = value && typeof value === 'object' && !Array.isArray(value)
      && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key]);
    if (nested) applyPreset(target[key], value);
    else target[key] = value;
  }
})(config, ${JSON.stringify(preset, null, 2)});

export default config;
`);
  if (merged === text) throw new Error('could not append the preset — config.js shape changed');
  await writeFile(staged, merged);

  /* A preset that produced an unparseable config would ship as a blank
     overlay with no error until someone opened it. Import it and check. */
  const applied = await import(`file://${staged}?v=${Date.now()}`).catch((err) => {
    throw new Error(`preset "${PRESET}" produced an invalid config.js — ${err.message}`);
  });
  const sample = Object.entries(preset)[0];
  const [section, values] = sample;
  const [firstKey, firstValue] = Object.entries(values)[0];
  const got = applied.default?.[section]?.[firstKey];
  if (JSON.stringify(got) !== JSON.stringify(firstValue)) {
    throw new Error(`preset "${PRESET}" did not take effect: ${section}.${firstKey} is ${JSON.stringify(got)}`);
  }
  console.log(`  preset applied: ${PRESET}`);
}

/* A short plain-text note for anyone who opens the folder before the HTML. */
await writeFile(join(STAGE, 'READ ME FIRST.txt'),
  [
    'Nightwire - Stream Overlay System',
    '  by Cat Sock Studio',
    '=====================================',
    '',
    'INSTALL',
    '  Double-click:   Setup.bat',
    '',
    '  That is the whole install. It installs what it needs, starts the',
    '  overlay, sets it to run at sign-in, and opens the dashboard.',
    '',
    'THE MANUAL',
    '  "Nightwire - Setup and Operating Manual.pdf"',
    '  36 pages, with screenshots: OBS setup, a tour of every dashboard',
    '  page, connecting Twitch or YouTube, a going-live checklist and',
    '  troubleshooting. Section 5 is the one to read first.',
    '',
    '  "START HERE.html" is the same thing in short, in your browser.',
    '',
    'DAY TO DAY',
    '  Dashboard        http://127.0.0.1:8787/dashboard.html',
    '  Start Server.bat     start the overlay and open the dashboard',
    '  Stop Server.bat      stop it (settings are kept)',
    '  Server Status.bat    is it running?',
    '',
    'IN OBS',
    '  Scene Collection -> Import -> obs\\Nightwire.json',
    '  Then add your camera and game capture BELOW the overlay.',
    '',
    'Everything runs on your own PC. Nothing is uploaded anywhere.',
    '',
  ].join('\r\n'));

/* Sanity: the scene collection must carry the substitution token, or Setup
   would install masks pointing at a path that does not exist. */
const collection = await readFile(join(STAGE, 'obs', 'Nightwire.json'), 'utf8');
if (!collection.includes('__PACKAGE_DIR__')) {
  throw new Error('scene collection is missing __PACKAGE_DIR__ — rebuild it with tools/build-scene-collection.mjs');
}

await rm(join(OUT, `${NAME}.zip`), { force: true });
execFileSync('zip', ['-r', '-q', `${NAME}.zip`, NAME], { cwd: OUT });

const { size } = await import('node:fs').then((fs) => fs.promises.stat(join(OUT, `${NAME}.zip`)));
console.log(`built  ${join(OUT, `${NAME}.zip`)}`);
console.log(`size   ${(size / 1024).toFixed(0)} KB`);
