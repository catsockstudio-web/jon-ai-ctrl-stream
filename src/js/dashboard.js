/* ============================================================
   dashboard.js — the guided control surface.

   Six sections over one shared store. Everything a section writes
   goes through store.commit() / store.fireAlert(), so the server
   stays the single owner of state and every OBS source sees the
   change at once.

   This is deliberately not a design editor: there is no canvas
   editing, no dragging, and no way to reach layout or the §09
   measurements. The controls that exist are bounded and reversible.
   ============================================================ */

import config from '../../config.js';
import { boot } from './providers/index.js';
import { formatDuration, uptimeMs, caffeinePercent, goalPercent, goalReadout } from './format.js';
import { applyTheme, normalizeTheme, THEME_DEFAULTS } from './theme.js';
import { assetUrl } from './assets.js';

const $ = (sel) => document.querySelector(sel);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

/* ---------- what exists ---------- */

const SECTIONS = [
  { id: 'live',     label: 'LIVE CONTROL' },
  { id: 'theme',    label: 'THEME' },
  { id: 'branding', label: 'BRANDING' },
  { id: 'scenes',   label: 'SCENE EDITOR' },
  { id: 'widgets',  label: 'WIDGETS & DATA' },
  { id: 'obs',      label: 'OBS SETUP' },
];

const SCENES = [
  { id: 'gameplay',      label: '1 GAMEPLAY',      file: 'scenes/gameplay.html',      obs: 'Gameplay' },
  { id: 'starting-soon', label: '2 STARTING SOON', file: 'scenes/starting-soon.html', obs: 'Starting Soon' },
  { id: 'just-chatting', label: '3 JUST CHATTING', file: 'scenes/just-chatting.html', obs: 'Just Chatting' },
  { id: 'brb',           label: '4 BRB',           file: 'scenes/brb.html',           obs: 'BRB' },
  { id: 'ending',        label: '5 ENDING',        file: 'scenes/ending.html',        obs: 'Ending' },
  { id: 'offline',       label: '6 OFFLINE',       file: 'scenes/offline.html',       obs: 'Offline' },
];

/* Only text that is genuinely data-driven is offered. Headlines like
   "THE MORNING GRIND IS STARTING SOON" are part of the design and are not
   listed, rather than being shown as a field that does nothing. */
const SCENE_FIELDS = {
  gameplay: [
    ['channel.wordmark', 'Wordmark', 'Brand bar, top left'],
    ['channel.showName', 'Show name', 'Next to the live dot'],
    ['channel.node', 'Node label', 'Right of the system strip'],
    ['channel.camLabel', 'Camera label', 'Inside the webcam frame'],
  ],
  'starting-soon': [
    ['channel.twitch', 'Channel line', 'Footer, left'],
    ['channel.location', 'Location line', 'Footer, middle'],
  ],
  'just-chatting': [
    ['stream.topic', "Today's topic", 'The large panel above the camera'],
    ['channel.wordmark', 'Wordmark', 'Header'],
    ['channel.handle', 'Handle', 'Footer'],
  ],
  brb: [
    ['channel.wordmark', 'Wordmark', 'Footer line'],
  ],
  ending: [
    ['channel.handle', 'Handle', 'Below the divider'],
  ],
  offline: [
    ['channel.wordmark', 'Wordmark', 'The large gradient title'],
    ['channel.tagline', 'Tagline', 'Under the title'],
    ['channel.blurb', 'Description', 'Paragraph of body copy'],
    ['channel.schedule', 'Schedule', 'Left pill'],
  ],
};

const BRANDING_SLOTS = [
  ['mascot', 'Mascot / logo', 'Starting Soon and Offline · 520 × 620 portrait'],
  ['avatar', 'Avatar', 'Brand bar and Just Chatting header · square'],
  ['logo', 'Logo', 'Reserved — not placed in any scene yet'],
  ['brbArt', 'BRB art', 'The panel on the BRB scene'],
  ['startingBackground', 'Starting Soon background', 'Full 1920 × 1080'],
  ['brbBackground', 'BRB background', 'Full 1920 × 1080'],
  ['endingBackground', 'Ending background', 'Full 1920 × 1080'],
];

const PROVIDERS = [
  ['Manual (control panel)', 'Everything you set here. No account, no credentials.', true],
  ['Twitch', 'EventSub for follows/subs/bits, IRC for chat.', false],
  ['StreamElements', 'Socket API for activity and tips.', false],
  ['Streamer.bot', 'Local WebSocket; no cloud credentials.', false],
];

const MODULE_SOURCES = [
  ['Brand bar', 'modules/brand-bar.html', '344 × 76'],
  ['System strip', 'modules/system-strip.html', '420 × 44'],
  ['Chat', 'modules/chat.html', '360 × 680'],
  ['Webcam frame', 'modules/webcam-frame.html', '400 × 253'],
  ['Activity tiles', 'modules/activity-tiles.html', '798 × 70'],
  ['Goal rail', 'modules/goal-rail.html', '1856 × 30'],
  ['Alerts', 'modules/alerts.html', '720 × 132'],
];

const CAMERAS = [
  ['Gameplay camera', '400 × 225', 'x32, y775'],
  ['Just Chatting camera', '1160 × 652', 'x56, y300'],
];

const GOAL_KEYS = [
  { key: 'follower', label: 'FOLLOWER GOAL' },
  { key: 'sub', label: 'SUB GOAL' },
  { key: 'coffee', label: 'COFFEE FUND' },
];

const store = await boot(config);

/* ---------- helpers ---------- */

const patchFor = (path, value) => path.split('.').reverse().reduce((acc, key) => ({ [key]: acc }), value);
const readPath = (obj, path) => path.split('.').reduce((acc, key) => acc?.[key], obj);

function copy(text, button) {
  const done = () => { const old = button.textContent; button.textContent = 'COPIED'; setTimeout(() => { button.textContent = old; }, 1200); };
  navigator.clipboard?.writeText(text).then(done).catch(() => {
    /* clipboard API needs a secure context; a hidden textarea always works. */
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } finally { ta.remove(); }
  });
}

/* ---------- section nav ---------- */

$('#nav').innerHTML = SECTIONS.map((s, i) =>
  `<button class="dash-nav__item${i === 0 ? ' is-active' : ''}" data-nav="${s.id}">${s.label}</button>`).join('');
document.querySelector('.dash-section[data-section="live"]').classList.add('is-active');

$('#nav').addEventListener('click', (event) => {
  const id = event.target.closest('[data-nav]')?.dataset.nav;
  if (!id) return;
  for (const b of document.querySelectorAll('[data-nav]')) b.classList.toggle('is-active', b.dataset.nav === id);
  for (const s of document.querySelectorAll('.dash-section')) s.classList.toggle('is-active', s.dataset.section === id);
});

/* ---------- scene preview ---------- */

let activeScene = SCENES[0];
$('#scene-tabs').innerHTML = SCENES.map((s) => `<button class="ctl-btn" data-scene="${s.id}">${s.label}</button>`).join('');

function selectScene(scene) {
  activeScene = scene;
  $('#preview').src = scene.file;
  for (const b of document.querySelectorAll('[data-scene]')) b.classList.toggle('is-active', b.dataset.scene === scene.id);
  renderSceneFields();
}
$('#scene-tabs').addEventListener('click', (event) => {
  const id = event.target.closest('[data-scene]')?.dataset.scene;
  if (id) selectScene(SCENES.find((s) => s.id === id));
});

/* ---------- bound inputs ---------- */

for (const input of document.querySelectorAll('[data-path]')) {
  const isNumber = input.type === 'number' || input.type === 'range';
  input.addEventListener('input', () => {
    store.commit(patchFor(input.dataset.path, isNumber ? Number(input.value) : input.value));
  });
}

for (const toggle of document.querySelectorAll('[data-toggle]')) {
  toggle.addEventListener('click', () => {
    store.commit(patchFor(toggle.dataset.toggle, !readPath(store.state, toggle.dataset.toggle)));
  });
}

/* ---------- session ---------- */

$('#go-live').addEventListener('click', () => store.commit({ stream: { startedAt: Date.now() } }));
$('#end-stream').addEventListener('click', () => store.commit({ stream: { startedAt: null } }));
$('#countdown').addEventListener('input', (event) => {
  const minutes = event.target.value.trim();
  store.commit({ stream: { countdownSeconds: minutes === '' ? null : Math.round(Number(minutes) * 60) } });
});

/* ---------- goals ---------- */

$('#goals').innerHTML = GOAL_KEYS.map(({ key, label }) => `
  <div class="ctl-field">
    <div class="ctl-field__label">${label}</div>
    <div class="ctl-row">
      <input type="number" data-goal="${key}.current" min="0" step="1" aria-label="${label} current">
      <input type="number" data-goal="${key}.target" min="1" step="1" aria-label="${label} target">
    </div>
    <div class="ctl-meter"><div class="ctl-meter__fill" data-goal-fill="${key}"></div></div>
    <div class="ctl-meter__label"><span data-goal-readout="${key}"></span><span data-goal-pct="${key}"></span></div>
  </div>`).join('');

for (const input of document.querySelectorAll('[data-goal]')) {
  const [key, field] = input.dataset.goal.split('.');
  input.addEventListener('input', () => store.commit({ goals: { [key]: { [field]: Number(input.value) } } }));
}

/* ---------- alerts ---------- */

const TILE_FOR = { follower: 'follower', sub: 'sub', tip: 'tip' };
for (const button of document.querySelectorAll('[data-alert]')) {
  button.addEventListener('click', () => {
    const kind = button.dataset.alert;
    const name = $('#alert-name').value.trim() || 'someone';
    const amount = $('#alert-amount').value.trim();
    const message = $('#alert-message').value.trim();
    store.fireAlert({ kind, name, amount: amount || undefined, message: message || undefined });
    const tile = TILE_FOR[kind];
    if (tile) store.commit({ activity: { [tile]: { value: kind === 'tip' && amount ? `${name} · ${amount}` : name } } });
  });
}

/* ---------- theme ---------- */

for (const input of document.querySelectorAll('[data-theme]')) {
  const key = input.dataset.theme;
  input.addEventListener('input', () => {
    const value = input.type === 'range' ? Number(input.value) : input.value;
    store.commit({ theme: { [key]: value } });
  });
}

$('#motion-seg').addEventListener('click', (event) => {
  const level = event.target.closest('[data-motion]')?.dataset.motion;
  if (level) store.commit({ theme: { motion: level } });
});

$('#theme-reset').addEventListener('click', async () => {
  await fetch('/api/theme/reset', { method: 'POST' }).catch(() => {});
});

/* ---------- branding ---------- */

$('#branding').innerHTML = BRANDING_SLOTS.map(([slot, name, hint]) => `
  <div class="dash-drop" data-slot="${slot}">
    <div class="dash-drop__thumb" data-thumb="${slot}">NONE</div>
    <div class="dash-drop__body">
      <div class="dash-drop__name">${name}</div>
      <div class="dash-drop__meta" data-meta="${slot}">${hint}</div>
    </div>
    <div class="dash-drop__actions">
      <button class="ctl-btn" data-pick="${slot}">CHOOSE</button>
      <button class="ctl-btn ctl-btn--ghost" data-clear="${slot}">CLEAR</button>
    </div>
  </div>`).join('');

const picker = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,image/jpeg,image/webp' });
let pickingSlot = null;
picker.addEventListener('change', () => { if (picker.files[0] && pickingSlot) upload(pickingSlot, picker.files[0]); picker.value = ''; });

async function upload(slot, file) {
  const meta = document.querySelector(`[data-meta="${slot}"]`);
  const say = (text, error = false) => { meta.textContent = text; meta.classList.toggle('is-error', error); };

  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { say(`${file.type || 'that file'} is not a PNG, JPEG or WebP`, true); return; }
  if (file.size > 8 * 1024 * 1024) { say(`${(file.size / 1048576).toFixed(1)} MB is over the 8 MB limit`, true); return; }

  say('Uploading…');
  try {
    const res = await fetch(`/api/branding/${slot}`, {
      method: 'POST', headers: { 'content-type': file.type }, body: file,
    });
    const body = await res.json();
    if (!res.ok) { say(body.error ?? `Upload failed (${res.status})`, true); return; }
    /* The server broadcasts the new state; render() paints the thumbnail. */
  } catch (err) {
    say(`Upload failed: ${err.message}`, true);
  }
}

$('#branding').addEventListener('click', (event) => {
  const pick = event.target.closest('[data-pick]');
  if (pick) { pickingSlot = pick.dataset.pick; picker.click(); return; }
  const clear = event.target.closest('[data-clear]');
  if (clear) fetch(`/api/branding/${clear.dataset.clear}/clear`, { method: 'POST' }).catch(() => {});
});

for (const zone of document.querySelectorAll('.dash-drop')) {
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  zone.addEventListener('dragover', (e) => { stop(e); zone.classList.add('is-over'); });
  zone.addEventListener('dragleave', (e) => { stop(e); zone.classList.remove('is-over'); });
  zone.addEventListener('drop', (e) => {
    stop(e); zone.classList.remove('is-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) upload(zone.dataset.slot, file);
  });
}

/* ---------- scene editor ---------- */

function renderSceneFields() {
  const fields = SCENE_FIELDS[activeScene.id] ?? [];
  $('#scene-editor-title').textContent = `${activeScene.label} — TEXT`;
  $('#scene-fields').innerHTML = fields.length
    ? fields.map(([path, label, hint]) => `
        <div class="ctl-field">
          <label class="ctl-field__label" for="sf-${path}">${label}</label>
          <input type="text" id="sf-${path}" data-scene-field="${path}">
          <div class="ctl-toggle__hint">${hint}</div>
        </div>`).join('')
    : '<p class="dash-panel__intro" style="margin:0">This scene has no editable text — everything on it is either design-fixed or driven by Live Control.</p>';

  for (const input of $('#scene-fields').querySelectorAll('[data-scene-field]')) {
    input.value = readPath(store.state, input.dataset.sceneField) ?? '';
    input.addEventListener('input', () => store.commit(patchFor(input.dataset.sceneField, input.value)));
  }
}

/* ---------- widgets & data ---------- */

$('#providers').innerHTML = PROVIDERS.map(([name, hint, live]) => `
  <div class="dash-status" style="border-left-color:${live ? 'var(--cyan)' : 'rgba(255,255,255,.2)'}">
    <div><div class="dash-status__name">${name}</div><div class="dash-status__hint">${hint}</div></div>
    <span class="dash-tag dash-tag--${live ? 'live' : 'planned'}">${live ? 'ACTIVE' : 'PLANNED'}</span>
  </div>`).join('');

/* ---------- OBS setup ---------- */

function urlRow(label, path, size) {
  const url = new URL(path, window.location.href).href;
  return `<div class="dash-url">
      <div class="dash-url__label">${label}</div>
      <div class="dash-url__value" title="${url}">${url}</div>
      <div class="dash-url__size">${size}</div>
      <button class="ctl-btn" data-copy="${url}">COPY</button>
    </div>`;
}
$('#obs-scenes').innerHTML = SCENES.map((s) => urlRow(s.obs, s.file, '1920 × 1080')).join('');
$('#obs-modules').innerHTML = MODULE_SOURCES.map(([label, path, size]) => urlRow(label, path, size)).join('');
$('#obs-cameras').innerHTML = CAMERAS.map(([label, size, pos]) => `
  <div class="dash-url">
    <div class="dash-url__label">${label}</div>
    <div class="dash-url__value">Camera source, placed <strong>below</strong> the overlay</div>
    <div class="dash-url__size">${size} @ ${pos}</div>
  </div>`).join('');

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-copy]');
  if (button) copy(button.dataset.copy, button);
});

/* ---------- render ---------- */

store.subscribe((state) => {
  /* The dashboard wears the theme it is editing, so a change is visible
     immediately rather than only in the preview. */
  const theme = applyTheme(state.theme);

  for (const input of document.querySelectorAll('[data-path]')) {
    if (document.activeElement === input) continue;
    const value = readPath(state, input.dataset.path);
    if (value !== undefined) input.value = value;
  }
  for (const toggle of document.querySelectorAll('[data-toggle]')) {
    toggle.classList.toggle('is-on', Boolean(readPath(state, toggle.dataset.toggle)));
  }

  /* theme controls */
  for (const input of document.querySelectorAll('[data-theme]')) {
    if (document.activeElement === input) continue;
    input.value = theme[input.dataset.theme];
  }
  $('#accent-hex').textContent = theme.accent;
  $('#accentAlt-hex').textContent = theme.accentAlt;
  $('#glow-readout').textContent = theme.glow.toFixed(2);
  $('#background-readout').textContent = theme.background.toFixed(2);
  for (const b of $('#motion-seg').querySelectorAll('[data-motion]')) {
    b.classList.toggle('is-active', b.dataset.motion === theme.motion);
  }

  /* goals */
  for (const { key } of GOAL_KEYS) {
    const goal = state.goals[key];
    const pct = goalPercent(goal);
    for (const field of ['current', 'target']) {
      const input = document.querySelector(`[data-goal="${key}.${field}"]`);
      if (input && document.activeElement !== input) input.value = goal[field];
    }
    document.querySelector(`[data-goal-fill="${key}"]`).style.width = `${pct}%`;
    document.querySelector(`[data-goal-readout="${key}"]`).textContent = goalReadout(goal);
    document.querySelector(`[data-goal-pct="${key}"]`).textContent = `${Math.round(pct)}%`;
  }

  /* branding thumbnails */
  for (const [slot, , hint] of BRANDING_SLOTS) {
    const entry = state.branding?.[slot];
    const zone = document.querySelector(`[data-slot="${slot}"]`);
    const thumb = document.querySelector(`[data-thumb="${slot}"]`);
    const meta = document.querySelector(`[data-meta="${slot}"]`);
    const url = entry?.file ? assetUrl(slot, config, '', state) : null;
    zone.classList.toggle('has-file', Boolean(url));
    thumb.style.backgroundImage = url ? `url("${url}")` : '';
    thumb.textContent = url ? '' : 'NONE';
    if (meta && !meta.classList.contains('is-error')) {
      meta.textContent = entry?.file
        ? `${entry.file} · ${(entry.bytes / 1024).toFixed(0)} KB`
        : hint;
    }
  }

  /* scene editor fields, when not being typed in */
  for (const input of document.querySelectorAll('[data-scene-field]')) {
    if (document.activeElement === input) continue;
    input.value = readPath(state, input.dataset.sceneField) ?? '';
  }

  /* countdown + header */
  const countdown = $('#countdown');
  if (document.activeElement !== countdown) {
    countdown.value = Number.isFinite(state.stream.countdownSeconds) ? Math.round(state.stream.countdownSeconds / 60) : '';
  }
  const live = Boolean(state.stream.startedAt);
  $('#live-label').textContent = live ? 'LIVE' : 'OFFLINE';
  $('#live-dot').className = live ? 'ja-dot' : 'ja-dot ja-dot--offline';
  $('#go-live').textContent = live ? 'RESTART STREAM' : 'START STREAM';

  const connected = state.connection !== 'lost';
  $('#link-label').textContent = connected ? 'SERVER LINKED' : 'SERVER UNREACHABLE';
  $('#link-label').style.color = connected ? 'var(--cyan)' : 'var(--amber)';
});

setInterval(() => {
  const ms = uptimeMs(store.state.stream, Date.now());
  $('#uptime-readout').textContent = ms === null ? '--:--:--' : formatDuration(ms);
  $('#caffeine-readout').textContent = `${caffeinePercent(store.state.caffeine, store.state.stream)}%`;
}, 1000);

selectScene(activeScene);
