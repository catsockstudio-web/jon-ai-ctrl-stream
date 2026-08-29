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

/* ---------- presets ----------
   A preset is nothing special: it writes the same tokens an operator could
   set by hand, so every value stays editable afterwards. */

export const THEME_PRESETS = {
  default:      { label: 'Nightwire Default', colors: { primary: '#8B4DFF', secondary: '#22E6E0', highlight: '#F0A855', background: '#0A0A0F', text: '#EAEAF2', textDim: '#8E8FA6' } },
  cyan:         { label: 'Cyan',          colors: { primary: '#1FA8C7', secondary: '#5BF0E0', highlight: '#F0A855', background: '#06121A', text: '#EAF6FA', textDim: '#7E97A6' } },
  purple:       { label: 'Purple',        colors: { primary: '#A855F7', secondary: '#E879F9', highlight: '#FBBF24', background: '#0C0716', text: '#F2EAFA', textDim: '#9B8FA6' } },
  green:        { label: 'Green',         colors: { primary: '#22C55E', secondary: '#A3E635', highlight: '#F0A855', background: '#07130C', text: '#EAFAEE', textDim: '#84A68F' } },
  amber:        { label: 'Amber',         colors: { primary: '#F59E0B', secondary: '#FCD34D', highlight: '#FB7185', background: '#150E04', text: '#FAF3EA', textDim: '#A6957E' } },
  highContrast: { label: 'High Contrast', colors: { primary: '#FFFFFF', secondary: '#00E5FF', highlight: '#FFD500', background: '#000000', text: '#FFFFFF', textDim: '#C9C9C9' } },
};

/* ---------- application ---------- */

const FALLBACK_COLORS = THEME_PRESETS.default.colors;

const LIMITS = {
  glow:                 { min: 0,   max: 2 },
  panelOpacity:         { min: 0.2, max: 1 },
  backgroundBrightness: { min: 0.6, max: 1.4 },
  borderBrightness:     { min: 0.2, max: 2 },
  scanlines:            { min: 0,   max: 0.6 },
  motion:               { min: 0,   max: 1.5 },
};

/** Coerce whatever is in state into something safe to paint. */
export function normalizeTheme(theme) {
  const t = theme ?? {};
  const colors = Object.fromEntries(Object.entries(FALLBACK_COLORS)
    .map(([k, fb]) => [k, parseHex(t.colors?.[k]) ? t.colors[k] : fb]));
  const intensity = Object.fromEntries(Object.entries(LIMITS)
    .map(([k, lim]) => [k, clamp(Number(t.intensity?.[k] ?? 1), lim.min, lim.max)]));
  return {
    colors,
    intensity,
    motionLevel: ['off', 'reduced', 'full'].includes(t.motionLevel) ? t.motionLevel : 'full',
    performance: ['low', 'balanced', 'high'].includes(t.performance) ? t.performance : 'balanced',
    preset: t.preset ?? 'default',
  };
}

export function motionEnabled(state) {
  return normalizeTheme(state?.theme).motionLevel !== 'off';
}

/**
 * Apply a theme to a document: custom properties and two data attributes.
 * Never layout, never a measurement — the worst a bad value can do is look
 * wrong, and every value has already been clamped above.
 */
export function applyTheme(theme, root = document.documentElement) {
  const t = normalizeTheme(theme);
  const c = t.colors;
  const i = t.intensity;

  const primary = parseHex(c.primary);
  const secondary = parseHex(c.secondary);
  const highlight = parseHex(c.highlight);
  const bg = parseHex(c.background);

  /* Violet/purple follow the primary, cyan/blue the secondary, amber the
     highlight. Magenta stays fixed — it means bits. */
  root.style.setProperty('--violet', toHex(primary));
  root.style.setProperty('--purple', toHex(lighten(primary, 0.18)));
  root.style.setProperty('--cyan', toHex(secondary));
  root.style.setProperty('--blue', toHex(lighten(secondary, 0.30)));
  root.style.setProperty('--amber', toHex(highlight));
  root.style.setProperty('--text-1', c.text);
  root.style.setProperty('--text-2', c.textDim);

  /* Background brightness scales the canvas only; panels keep their own
     translucency so text contrast never collapses. */
  root.style.setProperty('--bg', toHex(scale(bg, i.backgroundBrightness)));
  root.style.setProperty('--panel-bg', rgba(scale(bg, 1.35), i.panelOpacity));
  root.style.setProperty('--hairline', rgba(primary, clamp(0.30 * i.borderBrightness, 0.05, 1)));
  root.style.setProperty('--hairline-soft', rgba({ r: 255, g: 255, b: 255 }, clamp(0.08 * i.borderBrightness, 0.02, 0.4)));

  /* Glow is one number. Every accent shadow in the stylesheets is written as
     calc(<blur> * var(--glow-scale)) with a color-mix against its own accent
     token, so setting the scale here reaches all of them and each keeps the
     colour it is supposed to follow. Baking resolved rgba into --glow-* here
     used to leave the ~25 shadows that never referenced those tokens frozen
     at the shipped purple, ignoring both this slider and the accent. */
  root.style.setProperty('--glow-scale', String(i.glow));

  /* A package-wide scanline wash, separate from the per-alert effect. */
  root.style.setProperty('--scanline-opacity', String(i.scanlines));

  root.dataset.motion = t.motionLevel === 'off' ? '0' : '1';
  root.dataset.motionLevel = t.motionLevel;
  root.dataset.performance = t.performance;
  return t;
}

/** Reset a document back to the stylesheet's own values. */
export function clearTheme(root = document.documentElement) {
  for (const prop of ['--violet', '--purple', '--cyan', '--blue', '--amber', '--text-1', '--text-2',
    '--bg', '--panel-bg', '--hairline', '--hairline-soft',
    '--glow-scale', '--scanline-opacity']) {
    root.style.removeProperty(prop);
  }
  delete root.dataset.motionLevel;
  delete root.dataset.performance;
}
