/* ============================================================
   stage.js — one root scale, per §09 RESPONSIVE.

   Everything is authored at 1:1 inside a 1920 x 1080 stage. At any
   other source size we scale that single element rather than
   re-laying anything out, so a 1440p source is identical pixels at a
   different magnification. Hairlines divide by the same factor to
   stay 1 physical px (--hairline-w in tokens.css).
   ============================================================ */

export const STAGE_WIDTH  = 1920;
export const STAGE_HEIGHT = 1080;

/**
 * Keep `--stage-scale` in step with the window.
 * `fit: 'width'`  — scale on width alone (default; matches §09).
 * `fit: 'contain'` — never overflow either axis; use for previews.
 */
export function mountStage(options = {}) {
  const {
    fit = 'width',
    root = document.documentElement,
    /* A standalone module source is sized to the module, not the scene,
       so it scales against its own authored width. */
    width = STAGE_WIDTH,
    height = STAGE_HEIGHT,
  } = options;

  function apply() {
    const w = window.innerWidth  || width;
    const h = window.innerHeight || height;
    const scale = fit === 'contain'
      ? Math.min(w / width, h / height)
      : w / width;
    root.style.setProperty('--stage-scale', String(scale));
  }

  apply();
  window.addEventListener('resize', apply);
  return () => window.removeEventListener('resize', apply);
}
