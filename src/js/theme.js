/* ============================================================
   theme.js — turns the bounded theme settings into CSS tokens.

   Deliberately narrow. An operator gets two accents, glow
   strength, background brightness and a motion level; everything
   else stays as designed. Nothing here can change layout,
   spacing, type or the measurements in §09 — the worst a bad
   setting can do is look wrong, never break.
   ============================================================ */

/* ---------- small colour helpers (no dependencies) ---------- */

function parseHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const toHex = ({ r, g, b }) =>
  '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');

/** Move a colour toward white by `amount` (0–1). */
function lighten(rgb, amount) {
  return { r: rgb.r + (255 - rgb.r) * amount, g: rgb.g + (255 - rgb.g) * amount, b: rgb.b + (255 - rgb.b) * amount };
}

/** Scale a colour's channels, for background brightness. */
function scale(rgb, factor) {
  return { r: rgb.r * factor, g: rgb.g * factor, b: rgb.b * factor };
}

const rgba = (rgb, alpha) =>
  `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, ${Number(alpha.toFixed(3))})`;

/* ---------- defaults, so a missing or malformed value never breaks ---------- */

export const THEME_DEFAULTS = {
  accent: '#8B4DFF',
  accentAlt: '#22E6E0',
  glow: 1,
  background: 1,
  motion: 'full',
};

export const THEME_LIMITS = {
  glow:       { min: 0, max: 2,   step: 0.05 },
  background: { min: 0.6, max: 1.4, step: 0.02 },
  motion:     ['off', 'reduced', 'full'],
};

/** Coerce whatever is in state into something safe to apply. */
export function normalizeTheme(theme) {
  const t = { ...THEME_DEFAULTS, ...(theme ?? {}) };
  return {
    accent:     parseHex(t.accent) ? t.accent : THEME_DEFAULTS.accent,
    accentAlt:  parseHex(t.accentAlt) ? t.accentAlt : THEME_DEFAULTS.accentAlt,
    glow:       clamp(Number(t.glow) || 0, THEME_LIMITS.glow.min, THEME_LIMITS.glow.max),
    background: clamp(Number(t.background) || 1, THEME_LIMITS.background.min, THEME_LIMITS.background.max),
    motion:     THEME_LIMITS.motion.includes(t.motion) ? t.motion : THEME_DEFAULTS.motion,
  };
}

/** True when anything should animate at all. */
export function motionEnabled(state) {
  return normalizeTheme(state?.theme).motion !== 'off';
}

/**
 * Apply a theme to a document.
 * Writes only custom properties and two data attributes — never layout.
 */
export function applyTheme(theme, root = document.documentElement) {
  const t = normalizeTheme(theme);

  const accent = parseHex(t.accent);
  const alt = parseHex(t.accentAlt);

  /* Violet/purple follow the primary accent, cyan/blue the secondary. The
     lighter partners keep the design's two-tone gradients intact. */
  root.style.setProperty('--violet', toHex(accent));
  root.style.setProperty('--purple', toHex(lighten(accent, 0.18)));
  root.style.setProperty('--cyan', toHex(alt));
  root.style.setProperty('--blue', toHex(lighten(alt, 0.30)));

  /* Hairlines and panel edges are the accent at low alpha. */
  root.style.setProperty('--hairline', rgba(accent, 0.30));

  /* Glows scale with the slider and take their hue from the accents, so a
     recoloured package glows in its own colour rather than the original. */
  const g = t.glow;
  root.style.setProperty('--glow-violet', `0 0 ${28 * g}px ${rgba(accent, 0.18 * g)}`);
  root.style.setProperty('--glow-cyan',   `0 0 ${24 * g}px ${rgba(alt, 0.22 * g)}`);
  root.style.setProperty('--glow-alert',  `0 0 ${44 * g}px ${rgba(accent, 0.30 * g)}`);
  root.style.setProperty('--glow-scale', String(g));

  /* Background brightness scales the canvas colour only. Panels keep their
     own translucency so contrast with text never collapses. */
  const bg = scale({ r: 10, g: 10, b: 15 }, t.background);
  root.style.setProperty('--bg', toHex(bg));

  root.dataset.motion = t.motion === 'off' ? '0' : '1';
  root.dataset.motionLevel = t.motion;
  return t;
}

/** Reset a document back to the stylesheet's own values. */
export function clearTheme(root = document.documentElement) {
  for (const prop of ['--violet', '--purple', '--cyan', '--blue', '--hairline',
    '--glow-violet', '--glow-cyan', '--glow-alert', '--glow-scale', '--bg']) {
    root.style.removeProperty(prop);
  }
  delete root.dataset.motionLevel;
}
