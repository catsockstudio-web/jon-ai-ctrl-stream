/* ============================================================
   scene.js — the bootstrap every page shares.

   A page supplies a render(state) function returning the stage's
   HTML. This module owns everything else: stage scaling, provider
   boot, the motion gate, asset binding, the alert layer, and the
   ticker.

   Re-render is guarded by a string compare, so a scene's markup is
   only rewritten when something the operator changed actually
   alters it. Time-derived values (uptime, caffeine, countdown) are
   patched in place by the ticker instead, which is what keeps a
   running clock from restarting the scene's CSS animations.
   ============================================================ */

import { boot } from './providers/index.js';
import { mountStage } from './stage.js';
import { bindAssets } from './assets.js';
import { startTicker, createAlertLayer } from './widgets.js';
import { applyTheme } from './theme.js';

/**
 * @param {object} config
 * @param {object} options
 * @param {(state: object) => string} options.render  stage markup for a state
 * @param {string}  [options.base='../']  path back to the package root
 * @param {boolean} [options.alerts=false] mount the alert layer
 * @param {'width'|'contain'} [options.fit='width']
 * @param {(state: object, root: HTMLElement, store: object) => void} [options.onRender]
 */
export async function startScene(config, options) {
  const {
    render,
    base = '../',
    alerts = false,
    fit = 'width',
    width = 1920,
    height = 1080,
    /* §07 places alerts at y120 on a full scene; a standalone alert source
       is already sized to the card, so it centres at the top instead. */
    alertOffsetTop = height >= 1080 ? 120 : 0,
    onRender,
  } = options;

  mountStage({ fit, width, height });

  const stage = document.createElement('div');
  stage.className = 'stage';
  stage.style.width  = `${width}px`;
  stage.style.height = `${height}px`;
  document.body.appendChild(stage);

  /* Scene markup is rewritten wholesale on change, so it renders into an
     inner node. The alert layer is a sibling inside the stage: it scales
     with everything else, but a re-render never tears down an alert that
     is mid-flight. */
  const content = document.createElement('div');
  content.style.cssText = 'position:absolute;inset:0';
  stage.appendChild(content);

  const store = await boot(config);

  let lastHtml = null;
  store.subscribe((state) => {
    /* Accents, glow, background brightness and the motion level, all from
       server state — so a theme change reaches every open source at once. */
    applyTheme(state.theme);

    const html = render(state);
    if (html !== lastHtml) {
      lastHtml = html;
      content.innerHTML = html;
      bindAssets(content, config, base, state);
    }
    onRender?.(state, content, store);
  });

  if (alerts) stage.appendChild(createAlertLayer(store, { base, offsetTop: alertOffsetTop }));
  startTicker(document.body, store);

  /* Handy for debugging from the OBS source's own dev tools. */
  window.__jonAiCtrl = { store, config };
  return store;
}

/**
 * A single module as its own browser source (§09: "Each module is its own
 * browser source — OBS positions them"). Identical rendering to the same
 * module inside a scene; only the stage size differs, so a module placed
 * separately is pixel-for-pixel what it would have been in place.
 *
 * @param {number} options.width   authored module width
 * @param {number} options.height  authored module height
 */
export function startModule(config, options) {
  return startScene(config, options);
}
