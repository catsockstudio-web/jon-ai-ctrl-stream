# Acceptance tests

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
