/* ============================================================
   assets.js — optional user assets that override CSS fallbacks.

   Design rule (§09 FALLBACK RULE): "Every slot has a CSS/SVG resting
   state… No asset is required to ship." So nothing here is required.
   Each slot renders its fallback immediately; if a real file exists at
   the configured path, it is probed in the background and swapped in.

   The swap is pure CSS: the element gets `--asset-image` and the class
   `has-asset`, and the stylesheet decides what that means. Scene code
   never branches on whether an asset exists.
   ============================================================ */

const cache = new Map();

/** Resolve true if `url` loads as an image, false otherwise. Never throws. */
export function probe(url) {
  if (!url) return Promise.resolve(false);
  if (cache.has(url)) return cache.get(url);

  const result = new Promise((resolve) => {
    const img = new Image();
    img.onload  = () => resolve(img.naturalWidth > 0);
    img.onerror = () => resolve(false);
    img.src = url;
  });

  cache.set(url, result);
  return result;
}

/**
 * Point one element at an optional asset.
 * Adds `has-asset` + `--asset-image` only if the file actually loads.
 */
export async function applyAssetSlot(el, url) {
  if (!el || !url) return false;
  const ok = await probe(url);
  if (!ok) return false;
  /* Resolve against the DOCUMENT before handing the URL to CSS.
     A url() inside a custom property is resolved relative to the stylesheet
     that consumes it, not the page — so '../assets/x.png' set from a scene in
     /scenes/ would be looked up as /src/assets/x.png by components.css and
     404. The probe above uses the document's own base, so the two disagreed:
     the class went on, the placeholder hid, and the slot painted nothing. */
  const resolved = new URL(url, document.baseURI).href;
  el.style.setProperty('--asset-image', `url("${resolved}")`);
  el.classList.add('has-asset');
  return true;
}

/**
 * Bind every `[data-asset]` element under `root` to config.assets.
 *   <div class="ja-mascot" data-asset="mascot">…fallback…</div>
 *
 * `base` is the path from this document back to the package root — '../'
 * for pages in scenes/ and modules/, '' for control.html. Pages pass it
 * explicitly rather than having it inferred, so moving a page is a
 * one-line change with no hidden path arithmetic.
 *
 * Resolution happens in parallel and never blocks first paint.
 */
export function bindAssets(root, config, base = '') {
  const slots = root.querySelectorAll('[data-asset]');
  return Promise.all([...slots].map((el) => {
    const url = config.assets?.[el.dataset.asset];
    return url ? applyAssetSlot(el, resolve(url, base)) : false;
  }));
}

/** Resolve a package-root-relative asset path from a page `base`. */
export function resolve(path, base = '') {
  if (/^([a-z]+:)?\/\//i.test(path) || path.startsWith('/')) return path;
  return base + path;
}
