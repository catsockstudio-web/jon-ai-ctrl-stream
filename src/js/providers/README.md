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

## Planned

| Provider                  | id               | Notes                                          |
| ------------------------- | ---------------- | ---------------------------------------------- |
| `TwitchProvider`          | `twitch`         | EventSub for follows/subs/bits, IRC for chat   |
| `StreamElementsProvider`  | `streamelements` | Socket API for activity + tips                 |
| `StreamerBotProvider`     | `streamerbot`    | Local WebSocket; no cloud credentials          |

**Twitch authentication and EventSub are intentionally not implemented.**

## Adding one

1. Subclass `Provider` in a new file here.
2. In `start()`, begin pushing: `store.applyState({...})` for values that
   persist on screen, `store.emitAlert({...})` for one-shot events.
3. Report `capabilities` honestly. If the provider owns its own follower
   count, report `edit: false` — the control page then shows that field
   read-only instead of accepting an edit that would be overwritten.
4. Register it in `index.js` and set `provider: '<id>'` in `config.js`.

Nothing else in the package changes. The scenes cannot tell the difference.

### Mixing manual and live

A live provider may want the operator to keep driving some fields (topic,
caffeine) while the network owns others (followers, subs). Compose rather
than fork: hold a `ManualProvider` internally, forward `publish()` to it, and
let your own socket win for the fields it owns.
