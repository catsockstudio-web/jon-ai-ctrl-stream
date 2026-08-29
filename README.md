# Nightwire — Stream Overlay System

Modular OBS overlay system. Six scenes, seven
independently placeable modules, and a local control page that drives all of
them live.

By Cat Sock Studio. Built from a Claude Design handoff
(§09 Implementation Handoff is the authority for every measurement, token and
motion rule in here).

- **No accounts, no credentials, no cloud.** Everything runs on your machine.
- **No required assets.** Every image slot has a CSS/SVG fallback and the
  package is complete without a single file in `assets/`.
- **No build step.** Plain HTML, CSS and ES modules.

---

## Handing this to a client

```bash
node tools/build-scene-collection.mjs      # regenerate if openings moved
node tools/build-client-package.mjs        # -> dist/Nightwire Stream Overlay.zip
```

That ZIP (~73 KB) is the whole client deliverable. They extract it and
double-click **`Setup.bat`** — nothing else. It installs Node if missing,
sets the server to run at sign-in, installs a pre-wired OBS scene collection,
and opens the instructions.

No git, no terminal, no URLs to copy, no source sizes to type. Developer
files — tests, tooling, this README, the git plumbing — are deliberately left
out of the ZIP.

The scene collection carries a `__PACKAGE_DIR__` token for the camera mask
paths, which `Setup.bat` substitutes once it knows where the package landed.
Rebuild it whenever `CAMERA_OPENINGS` changes, or the client's camera will be
positioned to the old geometry.

## Quick start (Windows, development)

**Set it and forget it.** Double-click **`install-autostart.bat`** once. The
server then runs quietly in the background whenever you sign in — before OBS
ever opens — and you never think about it again. No admin rights needed; it
only writes a shortcut into your own Startup folder, and it starts the server
immediately so you do not have to sign out and back in.

This is the recommended setup. If every browser source goes blank at once, it
is almost always because the server is not running, and this removes that
failure mode entirely.

| Script | What it does |
| --- | --- |
| `install-autostart.bat` | Run the server at sign-in, hidden. Starts it now too. |
| `uninstall-autostart.bat` | Stop it running at sign-in. |
| `status.bat` | Is it running? Shows the last of `server.log` if not. |
| `stop.bat` | Stop it, however it was started. |
| `start.bat` | Update, then run it in a visible window. |
| `update.bat` | Update only. |

If you would rather run it by hand, double-click **`start.bat`** instead and
leave the window open while you stream. Use one approach or the other — with
auto-start installed, `start.bat` will find the port already taken and tell you
so. Prefer `status.bat` and `stop.bat` in that case.

`start.bat` pulls the latest version before starting. If you would rather it
never update on its own — no surprises before a stream — delete the `git pull`
line from it. Auto-start never updates; it only runs what you have.

Everything below explains what those do and how to wire OBS up.

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

## 2. Open the dashboard

<http://127.0.0.1:8787/dashboard.html>  (or just <http://127.0.0.1:8787>)

**Either an OBS dock or an external browser works** — they are equivalent, and
you can use both at once:

- **Inside OBS** — *View → Docks → Custom Browser Docks*, paste the URL.
- **In any browser** — Chrome, Edge, Firefox, Safari, on a second monitor.
- **From another machine** on your LAN, if you started with `--host 0.0.0.0`;
  use `http://<your-machine-ip>:8787/dashboard.html`.

All of these drive the same overlays, because state lives on the server rather
than in any one browser. The header shows **SERVER LINKED** while the dashboard
can reach it.

`control.html` still works — it redirects here, so an existing OBS dock or
bookmark does not break.

### The ten pages

Preview on the left, controls on the right. Pick a scene under the preview to
see what you are changing.

| Page | What it covers |
| --- | --- |
| **Live Control** | Start / end the stream, topic, now playing, countdown, caffeine, goal values, test alerts |
| **Theme** | Six colours, six intensity sliders, motion level, effect performance, presets, resets |
| **Branding** | Drag an image onto a slot. The server stores the file; it survives restarts |
| **Scenes** | Choose a scene, edit the text that scene actually uses |
| **Alerts** | Per type: text templates, duration, scale, position, colours, elements, animation, effect stack |
| **Chat** | Ground, scale, position, typography, colours, elements, message animation |
| **Goals** | Per goal: type, values, orientation, alignment, style, colours, elements |
| **Widgets** | Placement and scale presets, activity list, setup aids |
| **Integrations** | Connect Twitch, YouTube or the relay; performance modes; full reset |
| **OBS Setup** | Every browser-source URL with a copy button, exact sizes, camera placement |

Every page follows the same shape: **basic controls visible, deeper ones behind
an `ADVANCED` disclosure.** A beginner sees a short page; an advanced user opens
one section and gets everything.

### Two things worth knowing first

**Every control has an info button.** Press the `i` beside it and an explanation
appears under the preview — what it changes and, where it matters, what it does
*not*. That second half answers most of "is this broken?": chat settings do
nothing on a card with no chat, background brightness does nothing on the
transparent scenes, and the recent-events controls do nothing while Activity is
on TILES. Text lives in `src/js/help.js`, keyed by state path with repeated
groups collapsed to wildcards; a test asserts every control in the UI has an
entry, so a new control cannot ship unexplained.

**LIVE and PREVIEW.** In LIVE a change reaches OBS immediately. In PREVIEW it is
held in a draft only the dashboard's own frame is told about, so a scene can be
laid out mid-stream without an audience watching it happen; **PUSH TO LIVE**
sends the lot at once, **DISCARD** throws it away.

The draft never touches the server, so what OBS shows is still at all times
exactly what the server holds. It is not a second transport: the channel is
`postMessage` between same-origin frames, and a real browser source is
top-level, so `window.parent === window` and nothing can reach it. A test
asserts precisely that. A test alert in PREVIEW plays in the frame only.

### Two levels of customisation

This is the rule the whole customiser is built on:

```
widget override  ->  global theme  ->  schema default
```

The **global theme** sets the package's identity. Every widget inherits from it.
A **widget override** may replace selected theme values for one widget — so the
package can be purple and cyan while donation alerts run amber. Each widget has
a *Use global theme colours* toggle; switch it off and that widget's own colours
win, with any blank slot still falling back to the theme rather than to nothing.
Resetting an override returns the widget to inheriting, not to the shipped
default.

Amber and magenta are never recoloured by a theme: they mean money and bits, and
recolouring them would make alerts harder to read at a glance.

Motion has three levels — **full** as designed, **reduced** keeps only the live
status dot and stills everything decorative, **off** freezes the package. Reduced
is the useful middle setting when OBS is working hard.

### Alerts

Each type (follower, sub, tip, bits, and raid/gift-sub, which ship disabled) has
its own text, timing, placement, colours, element toggles and effect stack.

Text is templated: `{name}`, `{amount}`, `{message}`, `{tier}`, `{count}`. An
unknown token is **left visible** rather than silently dropped, so a typo shows
up instead of eating half the line.

Timing is owned by the queue, not by the animation: an alert lasts exactly its
configured duration whatever entrance it uses, one shows at a time, and each
fires exactly once.

### Effects

Nine effects, all CSS with one inline SVG turbulence for noise. No canvas, no
WebGL, and no per-frame JavaScript — these run while a game renders and video
encodes, so the work belongs on the compositor.

| Effect | Cost | Animated |
| --- | --- | --- |
| Glow / Bloom | low | no (baseline — see below) |
| Edge Trace | low | yes |
| Flicker | low | yes |
| Scanlines | low | no (movement optional) |
| RGB / Chromatic split | medium | no |
| Ghosting | medium | yes |
| VHS Slice / Tear | medium | yes |
| CRT Distortion | high | yes |
| Noise / Static | high | yes |

**Performance presets** cap what may run: `LOW` allows only low-cost effects,
`BALANCED` (default) adds medium, `HIGH` allows everything. An effect switched on
but suppressed is reported in the UI with the reason — it is never silently
ignored. **Motion Off** additionally drops every animated effect while leaving
static ones (glow, RGB split) in place.

**Glow is the one baseline effect**: neither the performance preset nor the
motion level can suppress it, so `LOW` plus *Motion Off* still looks like a
designed overlay rather than a broken one. Switching glow off by hand still
switches it off — baseline is a floor against the automatic gates, not an
override of the operator.

One honest limitation: **CRT curvature is faked.** A real barrel warp needs a
displacement filter or WebGL; the effect uses a rounded mask and an inner
vignette instead, which is convincing at overlay scale and costs almost nothing.

### Recent events

Set **Widgets → Activity → Mode** to *Recent events* and the activity slot
becomes a live list instead of the three tiles: newest first, one row per
follower, sub, tip, cheer, raid or gift, each in the accent its type owns.

Rows show the name, what happened, and the type's own detail — the amount for a
tip, the viewer count for a raid, the tier for a sub. Icons, wording and
timestamps are individually switchable, and *Compact rows* halves the row
padding. Which types reach the list is a set of category toggles; turning one
off hides events of that type immediately, including ones already on screen.

The list holds the last twenty events of the session and shows as many as
**Max events** allows, so lowering that number reveals history that is already
there rather than starting the list over. It is **never written to
`state.json`** — restarting the overlay starts the list empty instead of
replaying yesterday's followers. The card's RESET clears it on demand.

### Positions and scale

Placement is presets only, with authored safe margins — there is no freeform
dragging, and each widget exposes only the positions that make sense for it.
Scale is clamped per widget (alerts 70–150%, chat 75–125%, goals 60–150%) and
transforms from the corner nearest the anchor, so scaling up cannot push a
widget off the canvas. The webcam frame is deliberately **not** movable or
scalable: its opening is a transparent cutout at an authored position, and
moving it would leave the camera behind it out of register.

### Cropping the camera (Gameplay)

The overlay can only ever *cover* things, never crop them. On **Just Chatting**
that is enough: the scene's opaque background covers everything outside the
opening, so an oversized camera is hidden automatically.

**Gameplay is different.** That overlay is transparent everywhere — that is the
whole point, so game capture shows through — which means nothing covers a
camera that spills outside the frame. If your camera source is larger than
400 × 225, or offset from x32/y775, the excess shows on stream *outside* the
frame border. OBS will not clip it for you.

Two steps fix it:

1. **Size the camera source to exactly 400 × 225 at x32, y775.** Use *Edit
   Transform*; dragging by eye is not precise enough.
2. **Apply the rounded-corner mask.** Right-click the camera source →
   **Filters** → **+** → **Image Mask/Blend**, set *Type* to
   **Alpha Mask (Alpha Channel)**, and point *Path* at
   `obs/camera-mask-gameplay.png` in this repo.

Without step 2 the camera shows square corners poking outside the frame's
rounded border — most visibly at the 20 px top-right and bottom-left corners.

`obs/camera-mask-just-chatting.png` is included for completeness. You do not
normally need it, because that scene's background already covers the excess.
Both masks are rendered from the same `border-radius` the frame uses, so they
cannot drift from the design.

### Modules — only if you want to place pieces yourself

The scenes above already contain every module. Use these when you would rather
position something independently in OBS (§09: *"Each module is its own browser
source"*). Sizes are the authored module sizes — do not stretch them.

| Module         | URL                                                     | Size        | Scene position (Gameplay) |
| -------------- | ------------------------------------------------------- | ----------- | ------------------------- |
| Brand bar      | `http://127.0.0.1:8787/modules/brand-bar.html`          | 344 × 76    | x32, y32                  |
| System strip   | `http://127.0.0.1:8787/modules/system-strip.html`       | 420 × 44    | right-aligned, y32        |
| Chat           | `http://127.0.0.1:8787/modules/chat.html`               | 360 × 680   | x1528, y120               |
| Webcam frame   | `http://127.0.0.1:8787/modules/webcam-frame.html`       | 400 × 253\* | x32, y775                 |
| Activity       | `http://127.0.0.1:8787/modules/activity-tiles.html`     | 798 × 70†   | x472, y930                |
| Goal rail      | `http://127.0.0.1:8787/modules/goal-rail.html`          | 1856 × 30   | x32, y1026                |
| Alerts         | `http://127.0.0.1:8787/modules/alerts.html`             | 720 × 132   | centred, y120             |

\* The frame itself is 400 × 225; the nameplate hangs 14 px below it, so the
source needs 253 px of height.

† 798 × 70 draws the three tiles. Switching **Widgets → Activity → Mode** to
*Recent events* makes the same page draw the events list, which is taller:
give that source 798 × 480 and it will hold a full ten-row list. Inside a full
scene source no resizing is needed — the scene anchors the list by its bottom
edge so it grows upward.

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
| **Activity**       | The three gameplay tiles (firing an alert updates the matching one for you), or the recent-events list |
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
| `/api/theme/reset` | POST | theme back to `config.js` |
| `/api/branding/<slot>` | POST | upload an image (raw body, validated by magic bytes) |
| `/api/branding/<slot>/clear` | POST | delete it and fall back to the placeholder |

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

## State schema

One versioned document, owned by the server, persisted to `state.json`.

```
version       schema version — drives migration
theme         colors{6} · intensity{6} · motionLevel · performance · preset
alerts        follower · sub · tip · bits · raid · giftSub
                each: enabled, title, template, secondary, duration, scale,
                position, entrance, exit, animationMs, useThemeColors,
                colors{}, accent, elements{}, effects{9}
chat          enabled, mode, scale, position, maxMessages,
                typography{}, colors{}, elements{}, animation{}, messages[]
goals         items{follower,sub,coffee} · railGoal
                each: type, label, current, target, mode, orientation,
                alignment, scale, thickness, radius, useThemeColors,
                colors{}, elements{}
activity      enabled, mode (tiles | list), maxEvents, compact, position,
                scale, elements{}, categories{}, tiles{}
                events[]  — session-only, never written to state.json
widgets       brandBar · systemStrip · webcam · goalRail · alerts · chat · activity
                each: enabled, and position/scale where they apply
channel       wordmark, showName, handle, node, camLabel, …
stream        startedAt, topic, game, countdownSeconds
caffeine      percent, cup, cups, autoDecay, decayPerHour
branding      one entry per uploadable slot: {file, updatedAt, bytes} | null
display       showSafeArea, showSampleGameplay, showCameraPlaceholder
providers     active
```

`src/js/schema.js` is the single source of truth for defaults, limits, position
sets, scale ranges, effect metadata and alert presets. `src/js/resolve.js` is
the only place inheritance is decided.

### Migration

`state.json` carries a `version`. Anything without one is treated as v1 — the
flat shape the package shipped with — and `migrate()` moves it explicitly:

| v1 | v2 |
| --- | --- |
| `theme.accent` / `accentAlt` | `theme.colors.primary` / `.secondary` |
| `theme.glow` / `background` / `motion` | `theme.intensity.*` / `theme.motionLevel` |
| `modules.*` | `widgets.*.enabled` (and `chat.enabled`) |
| `goals.<key>` | `goals.items.<key>` |
| `display.chatGround` | `chat.mode` |
| `activity` | `activity.tiles` |

Within v2, a saved document is **topped up** rather than replaced: any setting
added since it was written appears at its default, and every choice already in
the file is kept. That is what lets a new control ship without a version bump
and without resetting an existing install.

Values are carried across one field at a time rather than merged into a shape
they predate, so an existing install keeps its settings. Uploaded artwork is
untouched by migration and by every reset except the per-slot Clear.

## Provider / style separation

A provider supplies **event values**; it never supplies styling.

```
provider says:   follower = "Adem", amount = "$5.00"
state says:      purple + cyan, RGB split 4px, 5s, bottom-centre, scale 1.2
```

That split is why a future `TwitchProvider` needs no knowledge of the theme, and
why connecting one will not disturb any customisation already made. Adding one
means writing a file in `src/js/providers/` and changing one line in
`config.js`.

## Resets

| Scope | How |
| --- | --- |
| One control | the `↺` beside its label |
| One widget / branch | `RESET` on the card, or `POST /api/reset/<branch>` |
| Whole theme | `RESET` on the Theme cards |
| Everything | Integrations → Danger Zone (asks first) |

`POST /api/reset/<branch>` accepts any dotted path into the schema —
`chat`, `theme.colors`, `alerts.tip` — and **replaces** that branch so removed
keys do not survive. A full reset keeps `branding`: uploaded artwork is the
user's own and is only removed by the explicit per-slot Clear.

## Live sources

Three, plus manual control, which never goes away.

| Source | What it supplies | Auth |
| --- | --- | --- |
| **Twitch** | Follows, subs, resubs, gift subs, cheers, raids, live status, chat | Device code |
| **YouTube Live** | Live chat, Super Chats, memberships, live status | Device code |
| **Relay** | Anything that can POST — Streamer.bot, StreamElements, Streamlabs, Kick bridges, a Stream Deck button | A local key |
| **Manual** | Everything, by hand | None |

Connect them on the dashboard's **Integrations** page. Manual control keeps
working alongside a live source, so you can still fire an alert by hand.

### Where integrations run, and why

**In the server, not the browser.** Two reasons, both non-negotiable:

1. Access tokens must never reach a page. Scenes are loaded by OBS and by any
   browser on the machine; a token in page JavaScript is a token in all of them.
2. The server already owns state and already pushes to every source over SSE.
   An integration that writes through that path reaches the overlays with no
   new transport and **no scene changes at all**.

An integration turns whatever a platform sends into the two things the rest of
the package already understands — `emitAlert()` and `patch()`. Nothing below
that seam knows what Twitch is, which is why `config.provider` stays `manual`
even with Twitch connected.

### Two load-bearing choices

**Device Code Flow, not authorization code.** The authorization-code flow wants
a client secret, and a secret shipped inside a folder the customer holds is not
a secret. Device flow needs only a public client id: the server asks for a
short code, you type it on the platform's site, and the server exchanges it for
tokens. Nothing confidential is distributed.

**EventSub over WebSocket, not webhooks.** Webhook EventSub needs a public
HTTPS endpoint, which would force a tunnel or a hosted relay and break the
package's central promise. The WebSocket transport is outbound-only, so a
localhost-bound server receives live events with no inbound port, no domain and
no certificate.

### Setting up the client ids

Client ids are public by design — they identify the application, not the user.
Register once and paste into `config.js`:

- **Twitch** — https://dev.twitch.tv/console/apps, type *Public*, redirect
  `http://localhost`. Paste the Client ID into `twitch.clientId`.
- **YouTube** — Google Cloud console, OAuth client of type *TV and Limited
  Input*. Paste into `youtube.clientId`.

Leave one blank and its Connect button explains what is missing rather than
failing silently. `JA_TWITCH_CLIENT_ID` and `JA_GOOGLE_CLIENT_ID` override
both, which is how the test suite points at a mock.

### Credentials

Tokens live in `<state>.credentials.json`, never in `state.json`, never in the
document broadcast over SSE, and never in the status endpoint. Three
consequences, all deliberate: **Reset everything cannot sign you out**, no
token can reach a scene, and deleting that one file signs out of everything.

### Ownership

A linked source declares the state paths it owns, and the dashboard **disables
those fields**. A follower count someone can type over while Twitch is
reporting it is a lie, so the control is removed rather than left to be
silently overwritten.

### The relay

One authenticated local endpoint anything can post to:

```
POST http://127.0.0.1:8787/api/ingest/<key>
{ "kind": "tip", "name": "dallas_dev", "amount": "$5.00" }
```

`kind` is one of `follower · sub · tip · bits · raid · giftSub`, or `chat` with
`user` and `text`. The key is generated per install and shown on the
Integrations page; without it any page in any browser could fire alerts on
stream. **NEW ADDRESS** rotates it.

This is the deliberate answer to the long tail. Writing nine more OAuth clients
to reach Kick, Trovo, Streamlabs, Ko-fi and a Stream Deck would be nine more
things to break; all of them can already issue an HTTP POST.

### What is not wired, and why

- **YouTube has no follow event.** Subscriptions are not published live, so the
  follower alert has no YouTube source. The UI says so rather than wiring it to
  something it is not.
- **Discord and Steam are not event sources.** Neither has follows, subs or
  tips to surface. If you want a Discord "live now" post or a Steam now-playing
  label, those are outbound features, not integrations — and either can be
  driven through the relay today.

---

## Layout

```
install-autostart.bat  Windows: run the server at sign-in (recommended)
uninstall-autostart.bat
start-hidden.vbs       Windows: launches the server with no console window
start.bat              Windows: update + start in a visible window
update.bat             Windows: update only
status.bat             Windows: is the server running?
stop.bat               Windows: stop it
server.log             last run's server output (git-ignored)
config.js              defaults — the one file you might hand-edit
dashboard.html         the dashboard — Live Control, Theme, Branding,
                       Scene Editor, Widgets & Data, OBS Setup
control.html           redirect stub, kept so old bookmarks still work
server.mjs             static host + authoritative state owner (SSE)
state.json             saved settings, written by the server (git-ignored)
scenes/                one full 1920 x 1080 page per scene
modules/               one page per independently placeable module
assets/                optional artwork; empty by default
obs/                   alpha masks for cropping the camera in OBS
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
  theme.js             bounded theme -> CSS tokens, with coercion
  dashboard.js         the dashboard's own logic
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

3. **The camera opening is a clip-path keyhole.** The scene's opaque layers
   live in one `.ja-scene__ground` element, clipped by a polygon that traces
   the stage clockwise and the opening counter-clockwise, bridged back to the
   origin. The opposing winding is what makes the middle a hole.
   `polygon(evenodd, …)` expresses this more directly but Chromium clips the
   whole element away when given it, so the bridge form is the one that works
   in OBS. The opening is traced with the frame's own corner radii so no camera
   bleeds past the rounded border.

4. **Gameplay's camera sits 16px above the sheet's y791.** The nameplate hangs
   14 px below the frame, and at y791 it landed on the goal rail's label
   (measured: 6 px vertical, 199 px horizontal overlap). The opening moved to
   y775 so it clears by 10 px, and the activity tiles moved up the same 16 px
   to keep the bottom band's shared baseline.

5. **Headline sizes assume Chakra Petch has loaded.** The §09 sizes are set for
   a condensed face; a wider fallback wraps an extra line and would push the
   Starting Soon column into its footer. `fitToHeight` in `src/js/widgets.js`
   shrinks a headline just enough to fit and restores the authored size once
   the webfont arrives, so with fonts available it never does anything.

## Tests

```bash
npm i -D playwright        # dev-only; the package has no runtime dependencies
node test/acceptance.mjs   # transport — needs no server, starts its own

node server.mjs &          # the rest run against a live server
node test/render.mjs       # every page mounts, no script errors
node test/alpha.mjs        # camera cutouts, masks, assets actually paint
node test/dashboard.mjs    # the ten pages, theming, uploads
node test/customizer.mjs   # customisation reaches live overlays (own server)
node test/integrations.mjs # Twitch/YouTube/relay against a mock (own server)
```

`customizer.mjs` is the one that matters most: every check reads the **scene**,
not the dashboard. A control that exists in the UI but does not change what OBS
renders is worse than no control, so the suite asserts on computed styles,
classes and geometry on the page a browser source would load — theme
propagation, override precedence, override reset falling back to the theme,
effect toggles and gating, alert timing and the queue, chat typography, goal
orientation, sub-element toggles, position and scale, the recent-events list,
resets, v1 migration, same-version top-up, restart persistence, and two
isolated browsers staying in sync.

`integrations.mjs` is the one that could not exist without a stand-in. Twitch
cannot be tested against Twitch — it needs a real account, a real broadcast and
a real follower to press the button — so `test/mock-twitch.mjs` reproduces the
device flow, Helix and the EventSub WebSocket frames by hand (Node has no
WebSocket server built in, so the handshake and framing are written out). The
suite then drives the real integration code against it. That is the difference
between "the code looks right" and "a `channel.cheer` frame becomes a bits
alert on screen". It covers every event mapping, the gifted-sub double-alert
trap, reconnection after a dropped socket, surviving a server restart, and six
checks that no token reaches state, disk, or the status endpoint.

`acceptance.mjs` drives the control page and the overlays in **two separate
Chromium instances**, which share no `BroadcastChannel` and no `localStorage`,
so it cannot accidentally pass on same-browser behaviour. It also restarts the
server mid-run to check reconnection and persistence.

`render.mjs` is the cheapest check and the one that would have caught the two
worst faults this package has had — a module contract change blanking every
scene, and a stale cached script doing the same.

`dashboard.mjs` drives the sections a client will actually touch, including a
deliberately bad upload: a control that silently accepts a bad file is worse
than one that refuses it loudly.

`alpha.mjs` samples real pixel alpha out of Chromium to prove each camera
opening is a genuine hole while the scene around it and the chrome over it
still render, and composites a scene over a coloured backdrop the way OBS
stacks a camera. See `test/README.md`.

## Requirements

Node 18+ (for `server.mjs`) and OBS 28+. Fonts load from Google Fonts and fall
back to local system faces if you stream offline.
