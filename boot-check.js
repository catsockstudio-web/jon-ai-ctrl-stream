/* ============================================================
   boot-check.js — turns a blank browser source into a message.

   A blank OBS source is the least useful failure there is: the
   server being down, a stale cached script, and a syntax error all
   look identical. This is a plain classic script (no module, no
   imports, no dependencies) so it still runs when the module graph
   is exactly what has failed.

   If the scene has not mounted shortly after load, it asks the
   server whether it is alive and puts the answer on screen.
   ============================================================ */

/* Deliberately at the package root, NOT under src/js: this file has to keep
   working when the module tree is exactly what has failed. Loaded as a plain
   classic script with no imports for the same reason. */

(function () {
  var GRACE_MS = 3500;

  function panel(title, detail, hint) {
    var el = document.createElement('div');
    el.setAttribute('data-boot-error', '');
    el.style.cssText = [
      'position:fixed', 'left:24px', 'top:24px', 'z-index:2147483647',
      'max-width:900px', 'padding:24px 28px',
      'background:rgba(10,10,15,.94)',
      'border:1px solid #F0A855', 'border-left:4px solid #F0A855',
      'border-radius:2px 18px 2px 18px',
      'font-family:ui-monospace,Consolas,monospace', 'color:#EAEAF2',
      'box-shadow:0 0 44px rgba(240,168,85,.25)',
    ].join(';');
    el.innerHTML =
      '<div style="font-size:13px;letter-spacing:.3em;color:#F0A855">NIGHTWIRE // OVERLAY DID NOT START</div>' +
      '<div style="font-size:26px;margin:12px 0 10px;font-weight:700">' + title + '</div>' +
      '<div style="font-size:16px;color:#8E8FA6;line-height:1.5">' + detail + '</div>' +
      (hint ? '<div style="font-size:15px;margin-top:14px;color:#22E6E0">' + hint + '</div>' : '');
    document.body.appendChild(el);
  }

  /* Record load failures as they happen — more precise than guessing later. */
  var failures = [];
  window.addEventListener('error', function (event) {
    if (event.target && event.target.src) failures.push(String(event.target.src));
    else if (event.message) failures.push(event.message);
  }, true);

  setTimeout(function () {
    /* startScene() appends .stage as soon as it boots. */
    if (document.querySelector('.stage')) return;
    if (document.querySelector('[data-boot-error]')) return;

    var probe = new XMLHttpRequest();
    probe.open('GET', '/api/state?boot-check=1', true);
    probe.timeout = 2500;

    probe.onload = function () {
      /* Server is fine, so the page's own scripts are the problem — almost
         always a cached copy of one file that no longer matches the rest. */
      panel(
        'The overlay scripts failed to load',
        'The server is running, so this source is holding a stale copy of the package.' +
        (failures.length ? '<br><br>Failed: ' + failures[0] : ''),
        'Right-click this source in OBS → Properties → “Refresh cache of current page”.'
      );
    };

    var down = function () {
      panel(
        'Cannot reach the overlay server',
        'Nothing is answering on 127.0.0.1:8787, so every overlay will be blank.',
        'Start the server, then refresh this source.'
      );
    };
    probe.onerror = down;
    probe.ontimeout = down;

    try { probe.send(); } catch (err) { down(); }
  }, GRACE_MS);
})();
