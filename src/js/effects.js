/* ============================================================
   effects.js — turns resolved effect settings into classes and
   custom properties. No per-frame work: it sets values once when
   an alert is built and CSS does the rest.
   ============================================================ */

import { activeEffects } from './resolve.js';

/* One turbulence texture, built once per page and shared by every alert.
   Generating noise is the expensive part; showing it is not. */
let noiseTexture = null;
function noise() {
  if (noiseTexture) return noiseTexture;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">` +
    `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>` +
    `<feColorMatrix type="saturate" values="0"/></filter>` +
    `<rect width="180" height="180" filter="url(#n)" opacity="0.6"/></svg>`;
  noiseTexture = `url("data:image/svg+xml;base64,${btoa(svg)}")`;
  return noiseTexture;
}

const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
  if (!m) return '139, 77, 255';
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
};

/**
 * Apply an effect stack to an element.
 *
 * @param {HTMLElement} el
 * @param {object} state    full app state (for performance + motion gates)
 * @param {object} widget   the widget's config, including `effects`
 * @param {object} colors   resolved colours, so effects tint themselves
 * @returns {string[]} the effect keys that actually ran
 */
export function applyEffects(el, state, widget, colors = {}) {
  if (!el) return [];
  const fx = activeEffects(state, widget);

  el.classList.add('fx');
  el.style.setProperty('--fx-rgb', hexToRgb(colors.primary));
  el.style.setProperty('--fx-rgb2', hexToRgb(colors.secondary));

  if (fx.glow) {
    el.classList.add('fx--glow');
    el.style.setProperty('--fx-glow-intensity', fx.glow.intensity);
    el.style.setProperty('--fx-glow-radius', `${fx.glow.radius}px`);
  }
  if (fx.edgeTrace) {
    el.classList.add('fx--edge-trace');
    el.style.setProperty('--fx-trace-speed', `${fx.edgeTrace.speed}s`);
    el.style.setProperty('--fx-trace-brightness', fx.edgeTrace.brightness);
  }
  if (fx.flicker) {
    el.classList.add('fx--flicker');
    el.style.setProperty('--fx-flicker-intensity', fx.flicker.intensity);
    el.style.setProperty('--fx-flicker-period', `${1 / Math.max(0.2, fx.flicker.frequency) * 6}s`);
  }
  if (fx.scanlines) {
    el.classList.add('fx--scanlines');
    el.style.setProperty('--fx-scan-opacity', fx.scanlines.opacity);
    el.style.setProperty('--fx-scan-spacing', `${fx.scanlines.spacing}px`);
    if (fx.scanlines.speed > 0) {
      el.classList.add('fx--scanlines-move');
      el.style.setProperty('--fx-scan-speed', `${12 / Math.max(0.5, fx.scanlines.speed)}s`);
    }
  }
  if (fx.rgbSplit) {
    el.classList.add('fx--rgb-split');
    el.style.setProperty('--fx-rgb-x', `${fx.rgbSplit.offsetX}px`);
    el.style.setProperty('--fx-rgb-y', `${fx.rgbSplit.offsetY}px`);
    el.style.setProperty('--fx-rgb-intensity', fx.rgbSplit.intensity);
  }
  if (fx.vhsSlice) {
    el.classList.add('fx--vhs');
    el.style.setProperty('--fx-vhs-shift', `${fx.vhsSlice.displacement}px`);
    el.style.setProperty('--fx-vhs-period', `${12 / Math.max(0.5, fx.vhsSlice.frequency)}s`);
  }
  if (fx.crt) {
    el.classList.add('fx--crt');
    el.style.setProperty('--fx-crt-intensity', fx.crt.intensity);
    el.style.setProperty('--fx-crt-curve', fx.crt.curvature);
    el.style.setProperty('--fx-crt-flicker', fx.crt.flicker);
  }
  if (fx.noise) {
    el.classList.add('fx--noise');
    el.style.setProperty('--fx-noise-texture', noise());
    el.style.setProperty('--fx-noise-intensity', fx.noise.intensity);
    el.style.setProperty('--fx-noise-period', `${1 / Math.max(1, fx.noise.frequency) * 6}s`);
  }
  if (fx.ghosting) {
    /* A ghost is one cloned copy that fades. It is removed with its host, so
       repeated alerts cannot accumulate nodes. */
    const ghost = el.cloneNode(true);
    ghost.classList.add('fx-ghost');
    ghost.classList.remove('fx--glow', 'fx--noise', 'fx--crt', 'fx--vhs');
    ghost.removeAttribute('data-alert-id');
    ghost.style.setProperty('--fx-ghost-offset', `${fx.ghosting.offset}px`);
    ghost.style.setProperty('--fx-ghost-opacity', fx.ghosting.opacity);
    ghost.style.setProperty('--fx-ghost-decay', `${fx.ghosting.decay}ms`);
    el.appendChild(ghost);
  }

  return Object.keys(fx);
}

/** Entrance/exit classes, kept separate so the queue owns timing. */
export function entranceClass(style) {
  const known = ['fade', 'slide', 'scale', 'pop', 'glitch', 'scan', 'none'];
  return `fx-in--${known.includes(style) ? style : 'fade'}`;
}
export function exitClass(style) {
  const known = ['fade', 'slide', 'glitch', 'collapse', 'none'];
  return `fx-out--${known.includes(style) ? style : 'fade'}`;
}
