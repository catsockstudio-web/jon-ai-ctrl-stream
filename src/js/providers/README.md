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

`ManualProvider` is driven by `control.html` over `BroadcastChannel`, with a
`localStorage` mirror for persistence and for scenes that open late.

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
