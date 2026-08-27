# Acceptance tests

Two suites: `acceptance.mjs` (transport) and `alpha.mjs` (compositing).

```bash
npm i -D playwright        # dev-only
node test/acceptance.mjs
```

The suite starts its own server on port 8788 (override with `PORT`), so it will
not disturb a server you have running for a live stream on 8787.

## Why two browsers

The control page and the OBS sources are separate browser clients. The whole
point of the server-mediated transport is that they do **not** need to share a
browser — so the test launches **two independent Chromium instances**: one
standing in for Chrome or Edge, one for OBS's embedded browser.

Two tabs, or two contexts of one browser, would not prove anything: they can
share `BroadcastChannel`, so a passing result could not distinguish
"the server delivered this" from "the browser did." Separate instances share
neither `BroadcastChannel` nor `localStorage`, so anything that arrives went
through the server.

The first check writes a `localStorage` key in one browser and asserts the
other cannot see it. If that ever fails, the isolation assumption is broken and
every later result is meaningless.

## What it covers

- Control page in browser A drives scenes in browser B: uptime, topic, module
  toggles, goal values
- Alerts cross browsers and fire exactly once (no local-echo double-up)
- Alerts clear after their 5 s life
- A source opened *after* changes gets current state immediately
- A refreshed source gets current state immediately
- Scenes keep nothing in `localStorage`
- Config survives a server restart, and an already-open source reconnects and
  resyncs without being reloaded

---

# alpha.mjs — camera compositing

```bash
node server.mjs &          # this suite runs against a live server on 8787
node test/alpha.mjs        # override with BASE=http://127.0.0.1:9000
```

OBS composites the camera *below* the browser source, so the camera is only
visible where the overlay renders nothing at all. Anything painted in the
frame's interior — a fill, an inset shadow, an opaque scene background — hides
it. This suite measures that directly rather than by eye.

## How it measures alpha

Playwright screenshots a 1×1 region with `omitBackground: true`, and the PNG is
decoded with `node:zlib`. Chromium writes colour type 6 (RGBA) when a region
carries any transparency and colour type 2 (RGB) when it is fully opaque, so
the IHDR is read rather than assumed — reading the alpha byte blindly makes an
opaque pixel look transparent, which would invert every result.

## What it covers

- Each opening's centre is fully transparent (alpha 0)
- The designed background still renders around the opening
- The nameplate renders *over* the opening
- The rounded corners are not bled past — the square region just outside a
  20 px corner stays covered
- The standalone webcam module is transparent too
- The sample gameplay plate keeps the opening open
- An OBS-style composite: a scene in an iframe over a magenta backdrop shows
  the backdrop through the opening and nowhere else

## The sensitivity check

Turning the camera placeholder **on** must make the centre opaque again. If the
transparency checks pass while that one also passes, the suite is not measuring
what it claims and every other result is meaningless.
