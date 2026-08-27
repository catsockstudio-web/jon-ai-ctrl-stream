# Assets — all optional

This folder is **empty on purpose**. Every slot in the package has a CSS/SVG
fallback from the design (§09 FALLBACK RULE: *"No asset is required to ship."*),
so the overlay is complete and good-looking with nothing in here.

To use your own artwork, drop a file in with the exact filename below and
reload the browser source. It takes over automatically — no code changes.
Delete the file and the slot returns to its fallback.

| Filename                  | Size            | Format            | Replaces |
| ------------------------- | --------------- | ----------------- | -------- |
| `avatar.png`              | 256 × 256       | transparent PNG   | The cyan eye-pair avatar in the brand bar |
| `mascot.png`              | 1040 × 1240 @2× | transparent PNG   | The dashed mascot panel with glowing eyes |
| `logo.png`                | 512 × 512       | transparent PNG   | reserved — not currently placed |
| `brb-art.png`             | 560 × 600       | transparent PNG   | The BRB mug/steam placeholder |
| `starting-background.jpg` | 1920 × 1080     | JPG               | Starting Soon's CSS glow field |
| `brb-background.jpg`      | 1920 × 1080     | JPG               | BRB's CSS glow field |
| `ending-background.jpg`   | 1920 × 1080     | JPG               | Ending's CSS glow field |
| `alert-follow.png`        | 152 × 152       | transparent PNG   | Follower alert icon |
| `alert-sub.png`           | 152 × 152       | transparent PNG   | Sub alert icon |
| `alert-tip.png`           | 152 × 152       | transparent PNG   | Donation alert icon |
| `alert-bits.png`          | 152 × 152       | transparent PNG   | Bits alert icon |

## How the override works

Each slot renders its fallback immediately, then `src/js/assets.js` quietly
probes for the file. If it loads, the element gets the class `has-asset` and a
`--asset-image` custom property, and the stylesheet does the rest. Nothing
blocks on the probe, so a missing file costs nothing and never delays paint.

A 404 in the browser console for a file you have not added is expected — that
is the probe finding nothing and keeping the fallback.

## Changing the paths

`config.js` → `assets` maps each slot to its path. Point them anywhere you
like, including a folder outside the package.
