# JON_AI_CTRL — Stream Package

Modular OBS overlay system for **The Morning Grind**. Six scenes, seven
independently placeable modules, and a local control page that drives all of
them live.

Built from the Claude Design handoff `JON_AI_CTRL Stream Package.dc.html`
(§09 Implementation Handoff is the authority for every measurement, token and
motion rule in here).

- **No accounts, no credentials, no cloud.** Everything runs on your machine.
- **No required assets.** Every image slot has a CSS/SVG fallback and the
  package is complete without a single file in `assets/`.
- **No build step.** Plain HTML, CSS and ES modules.

---

## 1. Start the server

`server.mjs` is both the static host and the **owner of live overlay state**.
The control page writes changes to it; every open browser source receives them
over Server-Sent Events. That matters because the overlays run inside OBS's
embedded browser while the control page usually does not — and nothing inside
a browser crosses that line, since `BroadcastChannel` and `localStorage` are
both scoped to one browser profile.

```bash
node server.mjs                    # http://127.0.0.1:8787
node server.mjs 9000               # or pick a port
node server.mjs --host 0.0.0.0     # also reachable from your LAN
```

Zero dependencies — one file, Node standard library only. Leave it running
while you stream. It binds to `127.0.0.1` unless you pass `--host`.

> **Start this before OBS.** A browser source that loads while the server is
> down shows blank; right-click the source → **Refresh** once the server is up.
> A source that was already open reconnects on its own and resyncs.

## 2. Open the control page

<http://127.0.0.1:8787/control.html>

**Either an OBS dock or an external browser works** — they are equivalent, and
you can use both at once:

- **Inside OBS** — *View → Docks → Custom Browser Docks*, paste the URL.
- **In any browser** — Chrome, Edge, Firefox, Safari, on a second monitor.
- **From another machine** on your LAN, if you started with `--host 0.0.0.0`;
  use `http://<your-machine-ip>:8787/control.html`.

All of these drive the same overlays, because state lives on the server rather
than in any one browser. The header shows **SERVER LINKED** while the control
page can reach it.

## 3. Add the browser sources

In OBS: **Sources → + → Browser**, then set **URL** and the exact **Width** and
**Height** below. Leave *Shutdown source when not visible* **off**, so a scene
keeps its state when you cut away.

### Scenes — one source each, all 1920 × 1080

| Scene              | URL                                                    | Size          | Transparent |
| ------------------ | ------------------------------------------------------ | ------------- | ----------- |
| 01 Gameplay        | `http://127.0.0.1:8787/scenes/gameplay.html`           | 1920 × 1080   | **Yes** — game capture goes behind it |
| 02 Starting Soon   | `http://127.0.0.1:8787/scenes/starting-soon.html`      | 1920 × 1080   | No — full scene |
| 03 Just Chatting   | `http://127.0.0.1:8787/scenes/just-chatting.html`      | 1920 × 1080   | No — camera goes behind the frame |
| 04 BRB             | `http://127.0.0.1:8787/scenes/brb.html`                | 1920 × 1080   | No — full scene |
| 05 Ending          | `http://127.0.0.1:8787/scenes/ending.html`             | 1920 × 1080   | No — full scene |
| 06 Offline         | `http://127.0.0.1:8787/scenes/offline.html`            | 1920 × 1080   | No — also exports for the Twitch offline slot |

**Layer order for Gameplay:** game capture at the bottom, then your camera
positioned inside the webcam frame at **400 × 225 @ x32, y791**, then the
overlay source on top.

**Layer order for Just Chatting:** camera at **1160 × 652 @ x56, y300**, scene
source on top.

### Modules — only if you want to place pieces yourself

The scenes above already contain every module. Use these when you would rather
position something independently in OBS (§09: *"Each module is its own browser
source"*). Sizes are the authored module sizes — do not stretch them.

| Module         | URL                                                     | Size        | Scene position (Gameplay) |
| -------------- | ------------------------------------------------------- | ----------- | ------------------------- |
| Brand bar      | `http://127.0.0.1:8787/modules/brand-bar.html`          | 344 × 76    | x32, y32                  |
| System strip   | `http://127.0.0.1:8787/modules/system-strip.html`       | 420 × 44    | right-aligned, y32        |
| Chat           | `http://127.0.0.1:8787/modules/chat.html`               | 360 × 680   | x1528, y120               |
| Webcam frame   | `http://127.0.0.1:8787/modules/webcam-frame.html`       | 400 × 253\* | x32, y791                 |
| Activity tiles | `http://127.0.0.1:8787/modules/activity-tiles.html`     | 798 × 70    | x472, y946                |
| Goal rail      | `http://127.0.0.1:8787/modules/goal-rail.html`          | 1856 × 30   | x32, y1026                |
| Alerts         | `http://127.0.0.1:8787/modules/alerts.html`             | 720 × 132   | centred, y120             |

\* The frame itself is 400 × 225; the nameplate hangs 14 px below it, so the
source needs 253 px of height.

If you use module sources, turn the same module **off** in the scene from the
control page so it is not drawn twice.

---

## Running the stream

Everything below is on the control page. Changes reach every open source
immediately and are saved on this machine, so closing the control page or
restarting OBS loses nothing.

| Panel              | What it does |
| ------------------ | ------------ |
| **Session**        | Start / reset / end the stream (drives the uptime clock and the ONLINE dot), today's topic, now-playing, and the optional Starting Soon countdown |
| **Caffeine**       | Level, cup *n* of *m*, and optional decay over the session |
| **Goals**          | Follower, sub and coffee-fund current/target — the rail, segments and mug all follow |
| **Fire an alert**  | Follower, sub, donation and bits alerts, with name, amount and message |
| **Modules**        | Chat panel, brand bar, system strip, webcam frame, activity tiles, goal rail, alerts |
| **Display**        | Motion gate, safe-area guides, sample gameplay plate, chat ground |
| **Channel**        | Wordmark, show name, handle, node, camera label, schedule, tagline, offline blurb |
| **Activity tiles** | The three gameplay tiles (firing an alert updates the matching one for you) |
| **Scene preview**  | Live preview of any scene; the checkerboard is transparency |

**Positioning tip.** Turn on *Sample gameplay plate* and *Safe-area guides*
while you lay sources out, then turn both off before going live.

**If OBS is struggling**, switch **Motion** off. That flattens every animation
in the package in one move (§08 reduced-motion rule) without changing anything
else.

---

## Your own artwork

Everything ships working with CSS/SVG fallbacks. To use real artwork, drop a
file into `assets/` with the exact name below and reload the source — it takes
over automatically. No code changes, and no need to touch `config.js`.

| File                       | Size            | Used by |
| -------------------------- | --------------- | ------- |
| `avatar.png`               | 256 × 256       | Brand bar, Just Chatting header |
| `mascot.png`               | 1040 × 1240 @2× | Starting Soon, Offline |
| `logo.png`                 | 512 × 512       | reserved |
| `brb-art.png`              | 560 × 600       | BRB |
| `starting-background.jpg`  | 1920 × 1080     | Starting Soon |
| `brb-background.jpg`       | 1920 × 1080     | BRB |
| `ending-background.jpg`    | 1920 × 1080     | Ending |
| `alert-follow.png` / `-sub` / `-tip` / `-bits` | 152 × 152 | Alert icons |

Transparent PNGs for anything that sits over a scene. Removing a file returns
that slot to its fallback. See `assets/README.md`.

---

## Defaults

`config.js` holds the **starting** values — what a fresh install, or a *Reset to
config.js defaults*, begins from. Routine operation never requires editing it;
the control page covers everything. Edit it when you want different starting
values, and it is well commented throughout.

---

## How the pieces talk

```
  control page  ──POST /api/state──►  server.mjs  ──SSE /api/events──►  OBS sources
  (dock, Chrome, ──POST /api/alert──►  (owns state,                     (scenes and
   Edge, LAN)                          state.json)                       modules)
```

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/state`  | GET  | current snapshot |
| `/api/state`  | POST | merge a patch, persist, broadcast |
| `/api/alert`  | POST | broadcast a one-shot alert |
| `/api/reset`  | POST | back to `config.js` defaults |
| `/api/events` | GET  | SSE stream — `state`, `patch`, `alert` |

Every new SSE connection is answered with a full `state` event first, which is
what makes a freshly added source, a refreshed source, and a source that
outlived a server restart all correct without special handling.

Settings persist to `state.json` beside `server.mjs`, so a restart keeps your
channel details, goals, module toggles and display options. Alerts are events
rather than state and are never persisted — a reconnecting source will not
replay yesterday's followers. A stream start time older than 24 hours is
treated as stale and cleared, so the overlay does not come up claiming to be
live from a previous session.

SSE rather than WebSockets: `EventSource` is native to every browser and the
server side is a few lines of plain `http`, so the package stays
dependency-free.

## Adding live Twitch data later

Scene and widget code reads only from the store; a **provider** is the one place
that knows where data comes from. Today that is `ManualProvider` (the control
page). Adding `TwitchProvider`, `StreamElementsProvider` or
`StreamerBotProvider` means writing one file and changing one line in
`config.js` — **no scene, module or stylesheet changes**.

Twitch authentication and EventSub are deliberately **not** implemented yet.
See `src/js/providers/README.md` for the contract and a worked plan.

---

## Layout

```
config.js              defaults — the one file you might hand-edit
control.html           operator control page
server.mjs             static host + authoritative state owner (SSE)
state.json             saved settings, written by the server (git-ignored)
scenes/                one full 1920 x 1080 page per scene
modules/               one page per independently placeable module
assets/                optional artwork; empty by default
test/                  acceptance suite (dev-only, needs Playwright)
src/css/
  tokens.css           §09 design tokens — colours, radii, glows, motion gate
  base.css             reset, stage scaling, §08 motion keyframes
  components.css       the §09 component inventory
  control.css          control page only
src/js/
  scene.js             bootstrap shared by every page
  components.js        component markup (pure functions)
  widgets.js           alert queue, ticker, stinger, type-on
  store.js             state + subscriptions (knows nothing about transport)
  providers/           where data comes from — the swap point
  transport.js         SSE client + POST helpers
  state.js             state shape and the merge rule
  stage.js             1920 x 1080 stage scaling
  format.js            uptime, caffeine, goal maths
  assets.js            optional-asset probing and override
```

## Notes on the design

Two places where the handoff needed a decision, recorded so they are easy to
revisit:

1. **BRB and Ending** are drawn at 944 × 531 in the design sheet but labelled
   *"both full 1920 × 1080, scaled to fit this sheet."* Every authored value in
   those two scenes is multiplied by 1920 ÷ 944 (≈ 2.034), so the proportions
   match the sheet exactly at full resolution. That puts the BRB headline at
   159 px and the Ending headline at 171 px. If they read too large on a real
   1080p canvas, those are single numbers in `scenes/brb.html` and
   `scenes/ending.html`.

2. **The sample gameplay plate** defaults to **off**, where the design mock had
   it on. On a live overlay it would cover the game capture; it is a
   positioning aid, so it lives on the control page instead.

3. **Headline sizes assume Chakra Petch has loaded.** The §09 sizes are set for
   a condensed face; a wider fallback wraps an extra line and would push the
   Starting Soon column into its footer. `fitToHeight` in `src/js/widgets.js`
   shrinks a headline just enough to fit and restores the authored size once
   the webfont arrives, so with fonts available it never does anything.

## Tests

```bash
npm i -D playwright        # dev-only; the package has no runtime dependencies
node test/acceptance.mjs
```

The suite drives the control page and the overlays in **two separate Chromium
instances**, which share no `BroadcastChannel` and no `localStorage` — so it
cannot accidentally pass on same-browser behaviour. It also restarts the server
mid-run to check reconnection and persistence. See `test/README.md`.

## Requirements

Node 18+ (for `server.mjs`) and OBS 28+. Fonts load from Google Fonts and fall
back to local system faces if you stream offline.
