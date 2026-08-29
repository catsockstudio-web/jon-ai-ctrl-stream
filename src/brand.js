/* ============================================================
   brand.js — who made this and what it is called.

   The product name appears in about forty places: page titles,
   the dashboard header, the installer, the OBS scene collection,
   the manual. Every one of them reads from here, so renaming the
   product is this file and a rebuild — not a pass through the
   codebase hoping nothing was missed.

   This is deliberately NOT the same thing as the overlay's own
   wordmark. `brand` is Cat Sock Studio's product identity and is
   fixed; `config.channel.wordmark` is the customer's own name and
   is theirs to change on first run. Confusing the two is how a
   product ends up with the vendor's name burned into the
   customer's overlay.
   ============================================================ */

export const brand = {
  /** Product name, as it appears in titles and the dashboard header. */
  name: 'NIGHTWIRE',
  /** Long form, for the manual cover, the installer and the OBS collection. */
  fullName: 'Nightwire',
  /** One line under the name. */
  tagline: 'Stream Overlay System',
  /** Who made it. */
  studio: 'Cat Sock Studio',
  /** Where it is sold and supported. */
  site: 'overlays.catsockstudios.com',
  /** Used for the OBS scene collection and the installed folder. */
  slug: 'Nightwire',
  /** What the Twitch and YouTube authorisation screens will show. */
  appName: 'Nightwire by Cat Sock Studio',
};

/** "Nightwire — Stream Overlay System" */
export const productLine = `${brand.fullName} — ${brand.tagline}`;

/** Page <title>, e.g. "Nightwire — Gameplay". */
export const pageTitle = (part) => (part ? `${brand.fullName} — ${part}` : brand.fullName);
