/* ============================================================
   controls.js — a small declarative form builder.

   The customiser has a few hundred settings. Hand-writing an
   input for each would be unreadable and would drift from the
   schema, so a page describes what it wants and this renders it
   and wires it to state.

   Every control writes through store.commit(), so there is one
   path from a control to the server to every OBS source.

   Basic controls render immediately; anything marked advanced
   goes inside a collapsed section, so a beginner sees a short
   page and an advanced user opens it.
   ============================================================ */

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const readPath = (obj, path) => path.split('.').reduce((acc, k) => acc?.[k], obj);
export const patchFor = (path, value) => path.split('.').reverse().reduce((acc, k) => ({ [k]: acc }), value);

/* ---------- one control ---------- */

function field(ctrl) {
  /* A note carries no path — it is prose between controls, not an input. */
  if (ctrl.type === 'note') return `<p class="dash-panel__intro" style="margin:8px 0 0;font-size:13px">${ctrl.label}</p>`;
  if (!ctrl.path) return '';

  const id = `c-${ctrl.path.replace(/[.\[\]]/g, '-')}`;
  const label = `<label class="ctl-field__label" for="${id}">${esc(ctrl.label)}${
    ctrl.reset === false ? '' : `<button class="ctl-reset" data-reset-control="${esc(ctrl.path)}" title="Reset this control">↺</button>`}</label>`;
  const hint = ctrl.hint ? `<div class="ctl-toggle__hint">${esc(ctrl.hint)}</div>` : '';

  switch (ctrl.type) {
    case 'color':
      return `<div class="ctl-field">${label}
        <div class="dash-swatch">
          <input type="color" id="${id}" data-ctl="${esc(ctrl.path)}" data-ctl-type="color">
          <input type="text" class="dash-hex" data-ctl-hex="${esc(ctrl.path)}" spellcheck="false" maxlength="7">
        </div>${hint}</div>`;

    case 'range':
      return `<div class="ctl-field">${label}
        <div class="dash-range">
          <input type="range" id="${id}" data-ctl="${esc(ctrl.path)}" data-ctl-type="number"
                 min="${ctrl.min}" max="${ctrl.max}" step="${ctrl.step ?? 1}">
          <output data-ctl-out="${esc(ctrl.path)}"></output>
        </div>${hint}</div>`;

    case 'number':
      return `<div class="ctl-field">${label}
        <input type="number" id="${id}" data-ctl="${esc(ctrl.path)}" data-ctl-type="number"
               min="${ctrl.min ?? ''}" max="${ctrl.max ?? ''}" step="${ctrl.step ?? 1}">${hint}</div>`;

    case 'text':
      return `<div class="ctl-field">${label}
        <input type="text" id="${id}" data-ctl="${esc(ctrl.path)}" data-ctl-type="text"
               placeholder="${esc(ctrl.placeholder ?? '')}">${hint}</div>`;

    case 'select':
      return `<div class="ctl-field">${label}
        <select id="${id}" data-ctl="${esc(ctrl.path)}" data-ctl-type="text">
          ${ctrl.options.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}
        </select>${hint}</div>`;

    case 'segmented':
      return `<div class="ctl-field">${label}
        <div class="dash-seg" data-ctl-seg="${esc(ctrl.path)}">
          ${ctrl.options.map(([v, t]) => `<button data-seg-value="${esc(v)}">${esc(t)}</button>`).join('')}
        </div>${hint}</div>`;

    case 'position':
      return `<div class="ctl-field">${label}
        <div class="dash-pos" data-ctl-pos="${esc(ctrl.path)}">
          ${ctrl.options.map((p) => `<button data-pos-value="${p}" title="${p}" class="${ctrl.allowed && !ctrl.allowed.includes(p) ? 'is-unavailable' : ''}"></button>`).join('')}
        </div>${hint}</div>`;

    case 'toggle':
      return `<div class="ctl-toggle" data-ctl-toggle="${esc(ctrl.path)}">
        <div><div class="ctl-toggle__label">${esc(ctrl.label)}</div>${ctrl.hint ? `<div class="ctl-toggle__hint">${esc(ctrl.hint)}</div>` : ''}</div>
        <span class="ctl-switch"></span></div>`;

    default:
      return '';
  }
}

/* ---------- a card of controls ---------- */

/**
 * @param {object} group
 *   title    card heading
 *   controls basic controls, always visible
 *   advanced controls behind a disclosure
 *   reset    the state branch, or branches, this card's "reset" button
 *            restores. A card whose controls span more than one branch —
 *            Theme's FEEL holds theme.intensity alongside theme.motionLevel —
 *            must name them all, or RESET leaves the strays behind and reads
 *            as a broken button.
 */
export function card(group) {
  const advanced = group.advanced?.length ? `
    <details class="dash-adv">
      <summary>ADVANCED</summary>
      <div class="dash-adv__body">${group.advanced.map(field).join('')}</div>
    </details>` : '';
  const branches = [group.reset].flat().filter(Boolean);
  const reset = branches.length
    ? `<button class="ctl-btn ctl-btn--ghost dash-card__reset" data-reset-branch="${esc(branches.join(' '))}">RESET</button>`
    : '';
  return `
    <div class="ctl-card">
      <div class="ctl-card__title">${esc(group.title)}${reset}</div>
      ${(group.controls ?? []).map(field).join('')}
      ${advanced}
    </div>`;
}

export const cards = (groups) => `<div class="dash-grid">${groups.map(card).join('')}</div>`;

/* ---------- binding ---------- */

/**
 * Wire every control inside `root` to the store.
 * Called once per render of a page; safe to call again.
 */
export function bindControls(root, store, { onReset } = {}) {
  const commit = (path, value) => store.commit(patchFor(path, value));

  root.addEventListener('input', (event) => {
    const el = event.target;
    const path = el.dataset.ctl;
    if (path) {
      const raw = el.dataset.ctlType === 'number' ? Number(el.value) : el.value;
      commit(path, raw);
      return;
    }
    const hexPath = el.dataset.ctlHex;
    if (hexPath && /^#[0-9a-f]{6}$/i.test(el.value)) commit(hexPath, el.value);
  });

  root.addEventListener('click', (event) => {
    const seg = event.target.closest('[data-seg-value]');
    if (seg) { commit(seg.parentElement.dataset.ctlSeg, seg.dataset.segValue); return; }

    const pos = event.target.closest('[data-pos-value]');
    if (pos && !pos.classList.contains('is-unavailable')) { commit(pos.parentElement.dataset.ctlPos, pos.dataset.posValue); return; }

    const toggle = event.target.closest('[data-ctl-toggle]');
    if (toggle) { commit(toggle.dataset.ctlToggle, !readPath(store.state, toggle.dataset.ctlToggle)); return; }

    const one = event.target.closest('[data-reset-control]');
    if (one) { onReset?.('control', one.dataset.resetControl); return; }

    const branch = event.target.closest('[data-reset-branch]');
    if (branch) { onReset?.('branch', branch.dataset.resetBranch); }
  });
}

/** Push current state into every control that is not being edited. */
export function syncControls(root, state) {
  for (const el of root.querySelectorAll('[data-ctl]')) {
    if (document.activeElement === el) continue;
    const value = readPath(state, el.dataset.ctl);
    if (value !== undefined && value !== null) el.value = value;
  }
  for (const el of root.querySelectorAll('[data-ctl-hex]')) {
    if (document.activeElement === el) continue;
    el.value = readPath(state, el.dataset.ctlHex) ?? '';
  }
  for (const out of root.querySelectorAll('[data-ctl-out]')) {
    const value = readPath(state, out.dataset.ctlOut);
    out.textContent = typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(2)) : (value ?? '');
  }
  for (const seg of root.querySelectorAll('[data-ctl-seg]')) {
    const value = readPath(state, seg.dataset.ctlSeg);
    for (const b of seg.querySelectorAll('[data-seg-value]')) b.classList.toggle('is-active', b.dataset.segValue === String(value));
  }
  for (const grid of root.querySelectorAll('[data-ctl-pos]')) {
    const value = readPath(state, grid.dataset.ctlPos);
    for (const b of grid.querySelectorAll('[data-pos-value]')) b.classList.toggle('is-active', b.dataset.posValue === value);
  }
  for (const t of root.querySelectorAll('[data-ctl-toggle]')) {
    t.classList.toggle('is-on', Boolean(readPath(state, t.dataset.ctlToggle)));
  }
}
