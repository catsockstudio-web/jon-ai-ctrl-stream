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
const NAME = 'JON_AI_CTRL Stream Package';
const OUT = join(ROOT, 'dist');
const STAGE = join(OUT, NAME);

/* What the client actually needs to run the overlays. */
const RUNTIME = ['server.mjs', 'config.js', 'dashboard.html', 'control.html', 'start-hidden.vbs', 'boot-check.js'];
const DIRS = ['scenes', 'modules', 'src', 'assets', 'obs'];
/* The client-facing wrappers, copied from client/ into the package root. */
const CLIENT = ['START HERE.html', 'Setup.bat', 'Start Server.bat', 'Server Status.bat', 'Stop Server.bat',
  'JON_AI_CTRL - Setup and Operating Manual.pdf'];

await rm(OUT, { recursive: true, force: true });
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

/* A short plain-text note for anyone who opens the folder before the HTML. */
await writeFile(join(STAGE, 'READ ME FIRST.txt'),
  [
    'JON_AI_CTRL - Stream Package',
    '===============================',
    '',
    'INSTALL',
    '  Double-click:   Setup.bat',
    '',
    '  That is the whole install. It installs what it needs, starts the',
    '  overlay, sets it to run at sign-in, and opens the dashboard.',
    '',
    'THE MANUAL',
    '  "JON_AI_CTRL - Setup and Operating Manual.pdf"',
    '  28 pages, with screenshots: OBS setup, a tour of every dashboard',
    '  page, a going-live checklist and troubleshooting.',
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
    '  Scene Collection -> Import -> obs\\JON_AI_CTRL.json',
    '  Then add your camera and game capture BELOW the overlay.',
    '',
    'Everything runs on your own PC. Nothing is uploaded anywhere.',
    '',
  ].join('\r\n'));

/* Sanity: the scene collection must carry the substitution token, or Setup
   would install masks pointing at a path that does not exist. */
const collection = await readFile(join(STAGE, 'obs', 'JON_AI_CTRL.json'), 'utf8');
if (!collection.includes('__PACKAGE_DIR__')) {
  throw new Error('scene collection is missing __PACKAGE_DIR__ — rebuild it with tools/build-scene-collection.mjs');
}

execFileSync('zip', ['-r', '-q', `${NAME}.zip`, NAME], { cwd: OUT });

const { size } = await import('node:fs').then((fs) => fs.promises.stat(join(OUT, `${NAME}.zip`)));
console.log(`built  ${join(OUT, `${NAME}.zip`)}`);
console.log(`size   ${(size / 1024).toFixed(0)} KB`);
