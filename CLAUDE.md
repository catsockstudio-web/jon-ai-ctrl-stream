# Nightwire — Stream Overlay System

A commercial OBS overlay package by **Cat Sock Studio**, sold to streamers as a
downloadable zip. It runs entirely on the customer's own PC — deliberately not
hosted. No account, no subscription, nothing uploaded.

First customer: **Jon** (`presets/jon.json`). The studio's own channel is
`catsockstudio` / catsockstudios.com.

---

## The one-paragraph architecture

`server.mjs` is a dependency-free Node HTTP server on `127.0.0.1:8787`. It owns
all state, persists it to `state.json`, and pushes changes to every open page
over SSE (`/api/events`). OBS loads each scene as a **browser source**; the
dashboard is just another page talking to the same server. That is why a change
in the dashboard appears on stream instantly, and why two browsers that share
nothing still stay in sync — everything goes through the server.

```
dashboard.html ──POST /api/state──► server.mjs ──SSE patch──► scenes/*.html (OBS)
                                        │
                                   state.json
```

## Layout

| Path | What it is |
|---|---|
| `server.mjs` | The whole server. State, SSE, uploads, integrations, static files. |
| `config.js` | Defaults and per-customer wording. A preset is merged in at build time. |
| `src/js/schema.js` | State shape, defaults, migrations. `SCHEMA_VERSION = 2`. |
| `src/js/scene.js` | Bootstrap every scene/module page shares: stage, render loop, assets, alerts. |
| `src/js/store.js` `transport.js` `providers/` | State container, SSE/POST transport, provider registry. |
| `src/js/components.js` `widgets.js` `effects.js` | Markup builders, behaviour, alert effects. |
| `src/js/dashboard.js` `controls.js` `help.js` | The ten-page control panel. |
| `src/server/integrations/` | Twitch, YouTube, and a generic relay. Tokens kept out of state. |
| `scenes/` | 6 scenes: gameplay, starting-soon, just-chatting, brb, ending, offline. |
| `modules/` | 7 standalone browser sources: brand-bar, system-strip, chat, webcam-frame, activity-tiles, goal-rail, alerts. |
| `obs/` | Generated scene collection, camera masks, `nightwire.ico`. |
| `client/` | Customer-facing wrappers copied to the package root at build time. |
| `docs/manual/` | 37-page illustrated manual (`manual.html` → PDF). |
| `test/` | Seven suites. See below. |

## Build

```bash
node tools/build-client-package.mjs              # product / demo build
node tools/build-client-package.mjs --preset jon # Jon's build
node tools/build-scene-collection.mjs            # regenerate obs/Nightwire.json
node tools/make-icon.mjs                         # regenerate obs/nightwire.ico
```

Both zips land in `dist/` (gitignored). **Always build both** — a fix must reach
both customers.

## Tests

Playwright required (`npm i -D playwright`). Some suites need a server on 8787;
`customizer` and `integrations` and `acceptance` start their own.

| Suite | Covers | Size |
|---|---|---|
| `test/render.mjs` | every page mounts with no console errors | 15 |
| `test/dashboard.mjs` | the control panel, resets, staleness | 40 |
| `test/alpha.mjs` | camera cutouts are genuinely transparent | 25 |
| `test/customizer.mjs` | controls actually reach the rendered scene | 92 |
| `test/integrations.mjs` | Twitch/YouTube/relay, token hygiene | 52 |
| `test/acceptance.mjs` | cross-browser transport, restart, shutdown | 25 |
| `test/buttons.mjs` | every clickable element does something | 224 elements |

Run all seven before shipping. `buttons` and `customizer` take a few minutes.

---

## Rules that are not negotiable

1. **Never fork code for the `jon` build.** `presets/jon.json` is data only, merged
   into `config.js` at build time. A forked file means a fix reaches one customer.
2. **The camera openings must stay fully transparent.** OBS composites the camera
   *below* the browser source, so anything painted inside the opening hides it.
   `test/alpha.mjs` measures real pixel alpha — it is the guard, do not weaken it.
   Openings: gameplay `400×225 @ 32,775`; just-chatting `1160×652 @ 56,300`.
3. **OBS source order, top to bottom: Overlay, Camera, Game Capture.** Game capture
   is full-screen and opaque; above the camera it hides it completely. This is
   stated in the manual, START HERE, and the dashboard's OBS Setup page — keep all
   three consistent.
4. **Docs ship with the code.** A functional change updates `README.md`,
   `docs/manual/manual.html` and `client/START HERE.html`. After editing the
   manual run `node docs/manual/paginate.mjs --fix` then `node docs/manual/render.mjs`
   — page numbers are measured, never estimated.
5. **Prove it, don't assert it.** Every claimed fix needs evidence: a failing test
   made to pass, a screenshot, a measured value. See the history below for why.

## Things that have bitten us, and why

Read the commit messages on `main` for the full account. The short version:

- **Branding is CSS, not markup.** Uploads set custom properties on
  `[data-asset]` elements. The render loop skips redrawing when the markup string
  is unchanged, so `bindAssets` must stay **outside** that guard or uploaded art
  never reaches an already-open OBS source. It cost days. `test/customizer.mjs`
  section 12 is the regression guard — verify it still *fails* on a revert.
- **A wordmark is one unbreakable word.** It never wraps, it overflows sideways
  silently. `fitToWidth` / `[data-fit-width]` guards every wordmark. `fitToHeight`
  cannot catch this; they solve different problems.
- **Several launchers, no owner.** Independent scripts each spawning a server left
  eight orphaned processes and no way to tell which was serving. Stop everything
  through `POST /api/shutdown`, never by force-killing the port holder. The server
  runs as `cmd /c node server.mjs > server.log`, so sweeps must match `cmd.exe` as
  well as `node.exe` — cmd owns the log handle and the working directory.
- **An old copy holding the port looks exactly like a broken update.** `/api/health`
  returns `root`, the serving folder; the dashboard's OBS Setup page and
  `Server Status.bat` both surface it. Say which folder, never "nothing to do".
- **Scene collections.** A legacy OBS collection alongside the Nightwire one will
  silently show stale sources. Worth ruling out before debugging rendering.

## Windows launchers

`Setup.bat` is the whole install: Node, shortcuts (Startup + Start Menu + Desktop),
OBS scenes. `Nightwire.vbs` starts the **server first**, then the tray
(`Nightwire.ps1`) — the tray must never be in the path of the thing it controls.
`Stop Server.bat` / `Uninstall.bat` stop gracefully and confirm the folder is free
to delete. `tray.log` records why the tray failed.

`.gitattributes` keeps `.bat` / `.vbs` / `.ps1` as CRLF. Do not "fix" that.

## API

`GET /api/state` · `POST /api/state` (merge patch) · `GET /api/events` (SSE) ·
`POST /api/alert` · `POST /api/reset` and `/api/reset/<branch>` ·
`POST /api/branding/<slot>` and `/clear` (raw body, magic-byte sniffed) ·
`GET /api/health` (build fingerprints + serving `root`) · `POST /api/shutdown`
(loopback-only, same-origin) · `POST /api/reload` · `/api/integrations/*` ·
`POST /api/ingest/<key>` (relay).

Branding slots: `logo`, `avatar`, `mascot`, `brbArt`, `startingBackground`,
`brbBackground`, `endingBackground`, `offlineBackground`.

## Open

The tray icon (`Nightwire.ps1`) has never been executed — it was written in a
Linux sandbox with no PowerShell. It does not appear on Windows and the cause is
unknown; prime suspect is a group-policy execution policy beating
`-ExecutionPolicy Bypass`, which `tray.log` will show on its `Policy:` line.
The overlay does not depend on it: the server starts independently and every
`.bat` works. Read `tray.log`, then run `Nightwire.ps1` directly to see the error.
