/* ============================================================
   widgets.js — the behaviour that markup alone cannot express:
   the alert queue, the once-a-second ticker, and the stinger.
   ============================================================ */

import { formatDuration, formatClock, caffeinePercent, uptimeMs } from './format.js';
import { alertCard } from './components.js';
import { bindAssets } from './assets.js';
import { motionEnabled } from './theme.js';

/* ------------------------------------------------------------
   Ticker — patches time-derived values in place.
   Never rewrites scene markup, so animations run uninterrupted.
   ------------------------------------------------------------ */
export function startTicker(root, store) {
  function tick() {
    const state = store.state;
    const now = Date.now();

    const uptimeEl = root.querySelector('[data-bind="uptime"]');
    if (uptimeEl) {
      const ms = uptimeMs(state.stream, now);
      uptimeEl.textContent = ms === null ? '--:--:--' : formatDuration(ms);
    }

    const caffeineEl = root.querySelector('[data-bind="caffeine"]');
    if (caffeineEl) caffeineEl.textContent = `${caffeinePercent(state.caffeine, state.stream, now)}%`;

    const countdownEl = root.querySelector('[data-bind="countdown"]');
    if (countdownEl && Number.isFinite(state.stream.countdownSeconds)) {
      countdownEl.textContent = formatClock(state.stream.countdownSeconds);
    }
  }

  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}

/* ------------------------------------------------------------
   Alert queue — 720 x 132, centre-top, 5 s life (§07).
   One alert on screen at a time; the rest wait their turn rather
   than stacking, so a raid never buries the game.
   ------------------------------------------------------------ */
export function createAlertLayer(store, { base = '../', offsetTop = 120 } = {}) {
  const layer = document.createElement('div');
  layer.className = 'ja-alert-layer';
  layer.style.cssText = `position:absolute;left:0;right:0;top:${offsetTop}px;display:flex;justify-content:center;pointer-events:none;z-index:80`;

  const queue = [];
  let showing = false;

  const duration = store.config.alerts?.durationMs ?? 5000;
  const maxQueue = store.config.alerts?.maxQueue ?? 12;
  /* Exit animation length from §07; kept in step with .is-leaving. */
  const EXIT_MS = 260;

  function next() {
    if (showing || queue.length === 0) return;
    if (!store.state.modules.alerts) { queue.length = 0; return; }

    showing = true;
    const data = queue.shift();
    layer.innerHTML = alertCard(data);
    const card = layer.firstElementChild;
    bindAssets(layer, store.config, base, store.state);

    /* The alert always holds for its full life; motion only decides
       whether it slides in and out or simply appears. */
    setTimeout(() => {
      card?.classList.remove('is-entering');
      card?.classList.add('is-leaving');
      setTimeout(() => {
        layer.innerHTML = '';
        showing = false;
        next();
      }, motionEnabled(store.state) ? EXIT_MS : 0);
    }, duration);
  }

  store.onAlert((alert) => {
    if (!store.state.modules.alerts) return;
    if (queue.length >= maxQueue) return;
    queue.push(alert);
    next();
  });

  return layer;
}

/* ------------------------------------------------------------
   Stinger — 260 ms glitch wipe on scene change (§08).
   ------------------------------------------------------------ */
export function fireStinger(root) {
  const el = root.querySelector('[data-bind="stinger"]');
  if (!el) return;
  el.classList.remove('is-firing');
  void el.offsetWidth;            /* restart the animation */
  el.classList.add('is-firing');
  setTimeout(() => el.classList.remove('is-firing'), 300);
}

/* ------------------------------------------------------------
   Terminal type-on — ~28 chars/s with a block caret (§08).
   Full-screen scenes only; never over gameplay.
   ------------------------------------------------------------ */
export function typeOn(el, text, { charsPerSecond = 28, motion = true } = {}) {
  if (!el) return () => {};

  /* Reserve the finished line's height before typing starts. A boot line long
     enough to wrap would otherwise grow the block mid-animation and shove
     everything below it down — and anything measuring the layout while typing
     is in flight (the fit guards) would measure the short version. Set the
     text once, lock the height, then animate inside that space. */
  el.textContent = text;
  const host = el.closest('.ja-terminal') ?? el.parentElement ?? el;
  const reserved = host.getBoundingClientRect().height;
  if (reserved > 0) host.style.minHeight = `${reserved}px`;

  if (!motion) return () => {};

  let index = 0;
  el.textContent = '';
  const id = setInterval(() => {
    index += 1;
    el.textContent = text.slice(0, index);
    if (index >= text.length) clearInterval(id);
  }, 1000 / charsPerSecond);
  return () => clearInterval(id);
}

/* ------------------------------------------------------------
   fitToHeight — keep a scene's text column inside its allotted
   space.

   Headline sizes come straight from §09 and are correct once
   Chakra Petch has loaded. If the webfont is unavailable (an
   offline stream, a blocked CDN) a wider fallback face wraps an
   extra line and the column grows into whatever sits below it.
   This shrinks the headline just enough to fit, in 2px steps.

   With the intended font it fits on the first measurement and
   does nothing at all.
   ------------------------------------------------------------ */
export function fitToHeight(el, maxHeight, { minSize = 48, step = 2, measure = null } = {}) {
  if (!el || !maxHeight || maxHeight < 0) return;
  /* Usually the element being scaled is the one that must fit. Sometimes it
     is not: on BRB the headline is what can give, but the whole column is
     what has to clear the footer. `measure` names the element to check. */
  const target = measure ?? el;

  /* The authored size, captured before any shrinking. Scenes set this
     inline (BRB and Ending are larger than the stylesheet's default), so
     resetting must restore this number rather than clearing the property
     and falling back to the class. */
  const authored = parseFloat(getComputedStyle(el).fontSize);
  if (!Number.isFinite(authored)) return;

  const run = () => {
    let size = authored;
    el.style.fontSize = `${size}px`;
    /* Bounded: worst case (authored - minSize) / step iterations. */
    while (target.getBoundingClientRect().height > maxHeight && size > minSize) {
      size -= step;
      el.style.fontSize = `${size}px`;
    }
  };

  run();
  /* Re-measure once the webfont arrives, so the common case ends back at
     the design's size even if the first paint used a fallback face. */
  document.fonts?.ready?.then(run).catch(() => {});
}
