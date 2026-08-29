# Data providers

Scene and widget code reads **only** from the store. A provider is the one
place that knows where numbers come from. That is the seam that lets a live
integration land later without rebuilding anything visual.

```
                 ┌────────────────┐
  data source ──►│    Provider    │──► store.applyState(patch)
                 │                │──► store.emitAlert(alert)
                 └────────────────┘
                          │
                          ▼
                       Store  ──►  scenes / modules  (read-only)
```

## Current

| Provider         | id       | Status  | Needs credentials |
| ---------------- | -------- | ------- | ----------------- |
| `ManualProvider` | `manual` | Shipped | No                |

`ManualProvider` is driven by `control.html` through the server: writes go out
as `POST /api/state` and `POST /api/alert`, and every connected page receives
changes over the `GET /api/events` SSE stream. `server.mjs` owns the state and
persists it to `state.json`.

Because the server mediates, the control page and the overlays do not need to
share a browser — the control page can run in an OBS dock, in Chrome or Edge,
or on another machine on the LAN.

A provider that talks to a network service should push into the store exactly
the same way; the SSE fan-out to other pages is the server's job, not the
provider's.

## Live sources live in the server, not here

The three real integrations — Twitch, YouTube Live and the relay — run in
`src/server/integrations/`, in the server process. Two reasons, both
non-negotiable:

1. **Access tokens must never reach a page.** Scenes are loaded by OBS and by
   any browser on the machine; a token in page JavaScript is a token in all of
   them.
2. **The server already owns state and already fans out over SSE.** An
   integration that writes through that path reaches every source with no new
   transport and no scene changes.

So a live source pushes through the same three doors the dashboard uses —
`emitAlert()`, `patch()`, `chat()` — and `config.provider` stays `'manual'`
even with Twitch connected. This client-side seam is what makes that work: the
scenes read the store and cannot tell where a follower came from.

| Source          | Where                                    | Auth        |
| --------------- | ---------------------------------------- | ----------- |
| Twitch          | `src/server/integrations/twitch.mjs`     | Device code |
| YouTube Live    | `src/server/integrations/youtube.mjs`    | Device code |
| Relay (anything)| `src/server/integrations/relay.mjs`      | Local key   |

See the README's **Live sources** section for the protocol choices and why they
were made. `test/mock-twitch.mjs` stands in for Twitch so the integration can
be tested without an account, a broadcast and a real follower.

## Adding a client-side provider

Only needed for something that genuinely belongs in the page rather than the
server — a local sensor, a file the browser can read, a test harness. Anything
with credentials belongs in `src/server/integrations/` instead.

1. Subclass `Provider` in a new file here.
2. In `start()`, begin pushing: `store.applyState({...})` for values that
   persist on screen, `store.emitAlert({...})` for one-shot events.
3. Report `capabilities` honestly. If the provider owns its own follower
   count, report `edit: false` — the dashboard then shows that field
   read-only instead of accepting an edit that would be overwritten.
4. Register it in `index.js` and set `provider: '<id>'` in `config.js`.

Nothing else in the package changes. The scenes cannot tell the difference.

### Ownership

A source that owns a value must say so, and the dashboard disables that field.
Server-side integrations declare it with `get owns()`; a client-side provider
reports it through `capabilities`. A follower count someone can type over while
Twitch is reporting it is a lie, so the control is removed rather than left to
be silently overwritten.
