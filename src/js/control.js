/* ============================================================
   control.js — the operator surface.

   Everything here goes through store.commit() / store.fireAlert(),
   which the active provider implements. Nothing in this file knows
   about BroadcastChannel or localStorage; swap in a live provider
   and the same controls drive it, minus whatever that provider
   reports as read-only.
   ============================================================ */

import config from '../../config.js';
import { boot } from './providers/index.js';
import { formatDuration, uptimeMs, caffeinePercent, goalPercent, goalReadout } from './format.js';

const SCENES = [
  { id: 'gameplay',      label: '01 GAMEPLAY',      file: 'scenes/gameplay.html' },
  { id: 'starting',      label: '02 STARTING SOON', file: 'scenes/starting-soon.html' },
  { id: 'just-chatting', label: '03 JUST CHATTING', file: 'scenes/just-chatting.html' },
  { id: 'brb',           label: '04 BRB',           file: 'scenes/brb.html' },
  { id: 'ending',        label: '05 ENDING',        file: 'scenes/ending.html' },
  { id: 'offline',       label: '06 OFFLINE',       file: 'scenes/offline.html' },
];

const GOAL_KEYS = [
  { key: 'follower', label: 'FOLLOWER GOAL' },
  { key: 'sub',      label: 'SUB GOAL' },
  { key: 'coffee',   label: 'COFFEE FUND' },
];

const store = await boot(config);

/* ---------- helpers ---------- */

/** Turn 'stream.topic' + value into the nested patch commit() expects. */
function patchFor(path, value) {
  return path.split('.').reverse().reduce((acc, key) => ({ [key]: acc }), value);
}

function readPath(object, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], object);
}

const $ = (selector) => document.querySelector(selector);

/* ---------- bound inputs ---------- */
/* Each [data-path] input owns one state field. Typing commits on input;
   the state subscription writes back only when the field is not focused,
   so a live update from elsewhere never yanks the caret mid-word. */
for (const input of document.querySelectorAll('[data-path]')) {
  const path = input.dataset.path;
  const isNumber = input.type === 'number' || input.type === 'range';
  input.addEventListener('input', () => {
    const value = isNumber ? Number(input.value) : input.value;
    store.commit(patchFor(path, value));
  });
}

/* ---------- toggles ---------- */
for (const toggle of document.querySelectorAll('[data-toggle]')) {
  const path = toggle.dataset.toggle;
  toggle.addEventListener('click', () => {
    store.commit(patchFor(path, !readPath(store.state, path)));
  });
}

/* ---------- session ---------- */
$('#go-live').addEventListener('click', () => {
  store.commit({ stream: { startedAt: Date.now() } });
});
$('#reset-uptime').addEventListener('click', () => {
  store.commit({ stream: { startedAt: Date.now() } });
});
$('#end-stream').addEventListener('click', () => {
  store.commit({ stream: { startedAt: null } });
});

$('#countdown').addEventListener('input', (event) => {
  const minutes = event.target.value.trim();
  store.commit({ stream: { countdownSeconds: minutes === '' ? null : Math.round(Number(minutes) * 60) } });
});

$('#reset-all').addEventListener('click', () => {
  if (!confirm('Discard your saved settings and go back to config.js defaults?')) return;
  store.provider.resetToDefaults?.();
});

/* ---------- goals ---------- */
const goalsHost = $('#goals');
goalsHost.innerHTML = GOAL_KEYS.map(({ key, label }) => `
  <div class="ctl-field" data-goal-key="${key}">
    <div class="ctl-field__label">${label}</div>
    <div class="ctl-row">
      <input type="number" data-goal="${key}.current" min="0" step="1" aria-label="${label} current">
      <input type="number" data-goal="${key}.target"  min="1" step="1" aria-label="${label} target">
    </div>
    <div class="ctl-meter"><div class="ctl-meter__fill" data-goal-fill="${key}"></div></div>
    <div class="ctl-meter__label"><span data-goal-readout="${key}"></span><span data-goal-pct="${key}"></span></div>
  </div>`).join('');

for (const input of goalsHost.querySelectorAll('[data-goal]')) {
  const [key, field] = input.dataset.goal.split('.');
  input.addEventListener('input', () => {
    store.commit({ goals: { [key]: { [field]: Number(input.value) } } });
  });
}

/* ---------- alerts ---------- */
/* Firing an alert also advances the matching activity tile, so the tile
   and the alert never disagree about who followed last. */
const TILE_FOR = { follower: 'follower', sub: 'sub', tip: 'tip' };

for (const button of document.querySelectorAll('[data-alert]')) {
  button.addEventListener('click', () => {
    const kind = button.dataset.alert;
    const name = $('#alert-name').value.trim() || 'someone';
    const amount = $('#alert-amount').value.trim();
    const message = $('#alert-message').value.trim();

    store.fireAlert({ kind, name, amount: amount || undefined, message: message || undefined });

    const tile = TILE_FOR[kind];
    if (tile) {
      const value = kind === 'tip' && amount ? `${name} · ${amount}` : name;
      store.commit({ activity: { [tile]: { value } } });
    }
  });
}

/* ---------- preview ---------- */
let activeScene = SCENES[0];
const tabs = $('#scene-tabs');
tabs.innerHTML = SCENES.map((scene) =>
  `<button class="ctl-btn" data-scene="${scene.id}">${scene.label}</button>`).join('');

function selectScene(scene) {
  activeScene = scene;
  $('#preview').src = scene.file;
  for (const button of tabs.querySelectorAll('[data-scene]')) {
    button.classList.toggle('is-active', button.dataset.scene === scene.id);
  }
}
tabs.addEventListener('click', (event) => {
  const id = event.target.closest('[data-scene]')?.dataset.scene;
  if (id) selectScene(SCENES.find((scene) => scene.id === id));
});
$('#open-scene').addEventListener('click', () => window.open(activeScene.file, '_blank'));
selectScene(activeScene);

/* ---------- render ---------- */
store.subscribe((state) => {
  for (const input of document.querySelectorAll('[data-path]')) {
    if (document.activeElement === input) continue;   /* never fight the operator */
    const value = readPath(state, input.dataset.path);
    if (value !== undefined) input.value = value;
  }

  for (const toggle of document.querySelectorAll('[data-toggle]')) {
    toggle.classList.toggle('is-on', Boolean(readPath(state, toggle.dataset.toggle)));
  }

  for (const { key } of GOAL_KEYS) {
    const goal = state.goals[key];
    const pct = goalPercent(goal);
    for (const field of ['current', 'target']) {
      const input = goalsHost.querySelector(`[data-goal="${key}.${field}"]`);
      if (input && document.activeElement !== input) input.value = goal[field];
    }
    goalsHost.querySelector(`[data-goal-fill="${key}"]`).style.width = `${pct}%`;
    goalsHost.querySelector(`[data-goal-readout="${key}"]`).textContent = goalReadout(goal);
    goalsHost.querySelector(`[data-goal-pct="${key}"]`).textContent = `${Math.round(pct)}%`;
  }

  const countdownInput = $('#countdown');
  if (document.activeElement !== countdownInput) {
    countdownInput.value = Number.isFinite(state.stream.countdownSeconds)
      ? Math.round(state.stream.countdownSeconds / 60)
      : '';
  }

  const live = Boolean(state.stream.startedAt);
  $('#live-label').textContent = live ? 'LIVE' : 'OFFLINE';
  $('#live-dot').className = live ? 'ja-dot' : 'ja-dot ja-dot--offline';
  $('#go-live').textContent = live ? 'RESTART STREAM' : 'START STREAM';

  document.documentElement.dataset.motion = state.display.motion ? '1' : '0';
});

/* Uptime and the caffeine readout tick locally, exactly as they do in a scene. */
setInterval(() => {
  const state = store.state;
  const ms = uptimeMs(state.stream, Date.now());
  $('#uptime-readout').textContent = ms === null ? '--:--:--' : formatDuration(ms);
  $('#caffeine-readout').textContent = `${caffeinePercent(state.caffeine, state.stream)}%`;
}, 1000);
