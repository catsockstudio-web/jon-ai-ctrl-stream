/* ============================================================
   dashboard.js — the guided customiser.

   Ten pages over one shared store. Everything a page writes goes
   through store.commit(), so the server stays the single owner of
   state and every OBS source sees the change at once.

   This is deliberately not a design editor: no canvas editing, no
   dragging, no route to layout or the §09 measurements. Positions
   are presets with authored margins and scales are clamped, so no
   control here can push a widget off the canvas.

   Pages are described as control lists (see controls.js) rather
   than hand-written inputs — several hundred settings would
   otherwise drift from the schema.
   ============================================================ */

import config from '../../config.js';
import { boot } from './providers/index.js';
import { formatDuration, uptimeMs, caffeinePercent, goalPercent, goalReadout, escapeHtml as esc } from './format.js';
import { applyTheme, THEME_PRESETS } from './theme.js';
import { assetUrl } from './assets.js';
import { cards, card, bindControls, syncControls, readPath, patchFor } from './controls.js';
import { merge } from './state.js';
import { helpFor } from './help.js';
import {
  ALERT_TYPES, EFFECTS, GOAL_TYPES, PERFORMANCE, POSITIONS, POSITIONS_FOR,
  SCALE_RANGE, TEMPLATE_TOKENS, DEMO_EVENT,
} from './schema.js';
import { suppressedEffects } from './resolve.js';

const $ = (sel) => document.querySelector(sel);

/* Which sub-item each multi-item page is showing. Local view state only —
   never committed, because it is not something OBS needs to know. */
/* `sources`, `owned` and `device` mirror the server's integration status.
   They are UI state, never persisted — the server is the only authority on
   what is actually connected. */
const ui = {
  alertType: 'follower', goalKey: 'follower', sources: [], owned: [], device: {},
  /* 'live' writes straight through to the server; 'preview' holds changes in
     `draft` until they are pushed. */
  mode: 'live', draft: {}, help: null,
};

const SECTIONS = [
  { id: 'live',        label: 'LIVE CONTROL' },
  { id: 'theme',       label: 'THEME' },
  { id: 'branding',    label: 'BRANDING' },
  { id: 'scenes',      label: 'SCENES' },
  { id: 'alerts',      label: 'ALERTS' },
  { id: 'chat',        label: 'CHAT' },
  { id: 'goals',       label: 'GOALS' },
  { id: 'widgets',     label: 'WIDGETS' },
  { id: 'integrations',label: 'INTEGRATIONS' },
  { id: 'obs',         label: 'OBS SETUP' },
];

const SCENES = [
  { id: 'gameplay',      label: '1 GAMEPLAY',      file: 'scenes/gameplay.html',      obs: 'Gameplay' },
  { id: 'starting-soon', label: '2 STARTING SOON', file: 'scenes/starting-soon.html', obs: 'Starting Soon' },
  { id: 'just-chatting', label: '3 JUST CHATTING', file: 'scenes/just-chatting.html', obs: 'Just Chatting' },
  { id: 'brb',           label: '4 BRB',           file: 'scenes/brb.html',           obs: 'BRB' },
  { id: 'ending',        label: '5 ENDING',        file: 'scenes/ending.html',        obs: 'Ending' },
  { id: 'offline',       label: '6 OFFLINE',       file: 'scenes/offline.html',       obs: 'Offline' },
];

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
  brb: [['channel.wordmark', 'Wordmark', 'Footer line']],
  ending: [['channel.handle', 'Handle', 'Below the divider']],
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

const MODULE_SOURCES = [
  ['Brand bar', 'modules/brand-bar.html', '344 × 76'],
  ['System strip', 'modules/system-strip.html', '420 × 44'],
  ['Chat', 'modules/chat.html', '360 × 680'],
  ['Webcam frame', 'modules/webcam-frame.html', '400 × 253'],
  ['Activity / recent events', 'modules/activity-tiles.html', '798 × 70 (tiles) · 798 × 480 (list)'],
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

/* ============================================================
   Generated customisation pages.
   Each page is a list of control descriptors; controls.js turns
   them into inputs and wires them to the store. Basic controls
   are visible, deeper ones sit behind ADVANCED.
   ============================================================ */

const POS_ALL = POSITIONS;

const effectControls = (base, key) => {
  const meta = EFFECTS[key];
  const ranges = {
    intensity: [0, 2, 0.05], radius: [0, 60, 1], speed: [0.5, 10, 0.1], brightness: [0, 2, 0.05],
    frequency: [0.5, 20, 0.5], opacity: [0, 1, 0.02], spacing: [1, 12, 1],
    offsetX: [0, 12, 1], offsetY: [0, 12, 1], offset: [0, 24, 1], decay: [100, 1200, 20],
    displacement: [0, 40, 1], curvature: [0, 1, 0.05], flicker: [0, 1, 0.05],
  };
  return [
    { type: 'toggle', path: `${base}.${key}.on`, label: meta.label, hint: `${meta.cost} cost${meta.animated ? ' · animated' : ' · static'}` },
    ...meta.controls.map((c) => {
      const [min, max, step] = ranges[c] ?? [0, 1, 0.05];
      return { type: 'range', path: `${base}.${key}.${c}`, label: c, min, max, step };
    }),
  ];
};

/* Plural nouns for the category toggles — "Followers" reads as a filter,
   where the ALERT_TYPES key reads as a code identifier. */
const ALERT_LABELS = {
  follower: 'Followers', sub: 'Subs', tip: 'Tips',
  bits: 'Bits', raid: 'Raids', giftSub: 'Gift subs',
};

function alertsPage(state) {
  const type = ui.alertType;
  const base = `alerts.${type}`;
  const cfg = state.alerts?.[type] ?? {};
  const tabs = ALERT_TYPES.map((t) =>
    `<button class="ctl-btn${t === type ? ' is-active' : ''}" data-alert-type="${t}">${t.toUpperCase()}</button>`).join('');

  const basic = cards([
    {
      title: 'BASIC', reset: base,
      controls: [
        { type: 'toggle', path: `${base}.enabled`, label: 'Enabled' },
        { type: 'text', path: `${base}.title`, label: 'Title text', hint: `Tokens: ${TEMPLATE_TOKENS.join(' ')}` },
        { type: 'text', path: `${base}.template`, label: 'Main text' },
        { type: 'text', path: `${base}.secondary`, label: 'Secondary / message' },
        { type: 'range', path: `${base}.duration`, label: 'Duration (ms)', min: 1000, max: 15000, step: 250 },
        { type: 'range', path: `${base}.scale`, label: 'Scale', min: SCALE_RANGE.alerts.min, max: SCALE_RANGE.alerts.max, step: 0.05 },
        { type: 'position', path: `${base}.position`, label: 'Position', options: POS_ALL, allowed: POSITIONS_FOR.alerts },
      ],
      advanced: [
        { type: 'toggle', path: `${base}.useThemeColors`, label: 'Use global theme colours', hint: 'Off lets this alert type carry its own' },
        { type: 'color', path: `${base}.colors.primary`, label: 'Primary colour' },
        { type: 'color', path: `${base}.colors.secondary`, label: 'Secondary colour' },
        { type: 'color', path: `${base}.colors.text`, label: 'Text colour' },
      ],
    },
    {
      title: 'ANIMATION',
      controls: [
        { type: 'select', path: `${base}.entrance`, label: 'Entrance',
          options: [['fade', 'Fade'], ['slide', 'Slide'], ['scale', 'Scale'], ['pop', 'Pop'], ['glitch', 'Signal Glitch'], ['scan', 'Scan Reveal'], ['none', 'None']] },
        { type: 'select', path: `${base}.exit`, label: 'Exit',
          options: [['fade', 'Fade'], ['slide', 'Slide'], ['glitch', 'Glitch Out'], ['collapse', 'Collapse'], ['none', 'None']] },
        { type: 'range', path: `${base}.animationMs`, label: 'Animation duration (ms)', min: 80, max: 1200, step: 20 },
      ],
    },
    {
      title: 'ELEMENTS',
      controls: Object.keys(cfg.elements ?? {}).map((k) => ({
        type: 'toggle', path: `${base}.elements.${k}`, label: k[0].toUpperCase() + k.slice(1),
      })),
    },
  ]);

  const suppressed = suppressedEffects(state, cfg);
  const warn = suppressed.length
    ? `<div class="dash-warn">Switched on but not running right now: ${suppressed.map(([k, why]) => `<strong>${EFFECTS[k].label}</strong> (${why})`).join(', ')}.</div>`
    : '';

  const effects = `<div class="dash-grid">${Object.keys(EFFECTS).map((key) => card({
    title: EFFECTS[key].label,
    controls: [effectControls(`${base}.effects`, key)[0]],
    advanced: effectControls(`${base}.effects`, key).slice(1),
  })).join('')}</div>`;

  return `
    <p class="dash-panel__intro">Each alert type has its own settings. Text supports tokens like <code>{name}</code> and <code>{amount}</code>; an unknown token is left visible rather than silently dropped. Use <strong>Test Alert</strong> under the preview to see it.</p>
    <div class="dash-scenes" style="margin-bottom:16px">${tabs}</div>
    ${basic}
    <div class="ctl-card__title" style="margin:26px 0 12px">EFFECT STACK ${warn}</div>
    ${effects}`;
}

function chatPage(state) {
  return `
    <p class="dash-panel__intro">Chat is a widget like any other: it inherits the theme unless you tell it not to. Fonts are limited to the three already bundled with the package, so an overlay looks the same with the network unplugged.</p>
    ${cards([
      { title: 'BASIC', reset: 'chat', controls: [
        { type: 'toggle', path: 'chat.enabled', label: 'Enabled' },
        { type: 'segmented', path: 'chat.mode', label: 'Ground', options: [['panel', 'PANEL'], ['transparent', 'TRANSPARENT']] },
        { type: 'range', path: 'chat.scale', label: 'Scale', min: SCALE_RANGE.chat.min, max: SCALE_RANGE.chat.max, step: 0.05 },
        { type: 'position', path: 'chat.position', label: 'Position', options: POS_ALL, allowed: POSITIONS_FOR.chat },
        { type: 'range', path: 'chat.maxMessages', label: 'Max visible messages', min: 3, max: 20, step: 1 },
      ]},
      { title: 'TYPOGRAPHY', controls: [
        { type: 'select', path: 'chat.typography.family', label: 'Font',
          options: [['ui', 'Barlow — interface'], ['display', 'Chakra Petch — display'], ['mono', 'JetBrains Mono — data']] },
        { type: 'range', path: 'chat.typography.size', label: 'Size (px)', min: 12, max: 34, step: 1 },
      ], advanced: [
        { type: 'range', path: 'chat.typography.weight', label: 'Weight', min: 400, max: 700, step: 100 },
        { type: 'range', path: 'chat.typography.lineHeight', label: 'Line height', min: 1, max: 2, step: 0.05 },
        { type: 'range', path: 'chat.typography.spacing', label: 'Message spacing (px)', min: 4, max: 32, step: 1 },
      ]},
      { title: 'COLOURS', controls: [
        { type: 'toggle', path: 'chat.colors.useThemeColors', label: 'Use global theme colours' },
        { type: 'select', path: 'chat.colors.usernameMode', label: 'Username colour',
          options: [['provider', 'From provider'], ['theme', 'Theme accents'], ['single', 'One colour']] },
      ], advanced: [
        { type: 'color', path: 'chat.colors.usernameColor', label: 'Single username colour' },
        { type: 'color', path: 'chat.colors.text', label: 'Message text' },
        { type: 'color', path: 'chat.colors.background', label: 'Background' },
        { type: 'range', path: 'chat.colors.backgroundOpacity', label: 'Background opacity', min: 0, max: 1, step: 0.02 },
        { type: 'color', path: 'chat.colors.border', label: 'Border' },
        { type: 'color', path: 'chat.colors.header', label: 'Header' },
      ]},
      { title: 'ELEMENTS', controls: [
        { type: 'toggle', path: 'chat.elements.header', label: 'Header' },
        { type: 'toggle', path: 'chat.elements.viewerCount', label: 'Viewer count' },
        { type: 'toggle', path: 'chat.elements.rail', label: 'Scroll rail' },
      ], advanced: [
        { type: 'toggle', path: 'chat.elements.timestamps', label: 'Timestamps' },
        { type: 'toggle', path: 'chat.elements.badges', label: 'Badges' },
        { type: 'toggle', path: 'chat.elements.rounded', label: 'Rounded panel' },
      ]},
      { title: 'MESSAGE ANIMATION', controls: [
        { type: 'select', path: 'chat.animation.style', label: 'Style',
          options: [['none', 'None'], ['fade', 'Fade'], ['slide', 'Slide'], ['rise', 'Rise'], ['digital', 'Digital Reveal']] },
        { type: 'range', path: 'chat.animation.speed', label: 'Speed (ms)', min: 60, max: 800, step: 20 },
        { type: 'range', path: 'chat.animation.distance', label: 'Distance (px)', min: 0, max: 40, step: 1 },
      ]},
    ])}`;
}

function goalsPage(state) {
  const key = ui.goalKey;
  const base = `goals.items.${key}`;
  const tabs = Object.keys(state.goals?.items ?? {}).map((k) =>
    `<button class="ctl-btn${k === key ? ' is-active' : ''}" data-goal-key="${k}">${k.toUpperCase()}</button>`).join('');

  return `
    <p class="dash-panel__intro">One configurable component covers every goal — horizontal rail, vertical bar or the coffee mug. Changing any of this needs no HTML.</p>
    <div class="dash-scenes" style="margin-bottom:16px">${tabs}</div>
    ${cards([
      { title: 'BASIC', reset: base, controls: [
        { type: 'toggle', path: `${base}.enabled`, label: 'Enabled' },
        { type: 'select', path: `${base}.type`, label: 'Goal type', options: GOAL_TYPES.map((t) => [t, t.toUpperCase()]) },
        { type: 'text', path: `${base}.label`, label: 'Label' },
        { type: 'number', path: `${base}.current`, label: 'Current', min: 0 },
        { type: 'number', path: `${base}.target`, label: 'Target', min: 1 },
        { type: 'range', path: `${base}.scale`, label: 'Scale', min: SCALE_RANGE.goal.min, max: SCALE_RANGE.goal.max, step: 0.05 },
      ]},
      { title: 'LAYOUT', controls: [
        { type: 'segmented', path: `${base}.orientation`, label: 'Orientation', options: [['horizontal', 'HORIZONTAL'], ['vertical', 'VERTICAL']] },
        { type: 'segmented', path: `${base}.alignment`, label: 'Alignment', options: [['left', 'LEFT'], ['center', 'CENTER'], ['right', 'RIGHT']] },
        { type: 'select', path: `${base}.mode`, label: 'Style', options: [['rail', 'Rail'], ['segmented', 'Segmented'], ['mug', 'Mug']] },
      ], advanced: [
        { type: 'range', path: `${base}.thickness`, label: 'Bar thickness (px)', min: 2, max: 40, step: 1 },
        { type: 'range', path: `${base}.radius`, label: 'Corner radius (px)', min: 0, max: 20, step: 1 },
        { type: 'range', path: `${base}.segments`, label: 'Segment count', min: 4, max: 24, step: 1 },
      ]},
      { title: 'STYLE', controls: [
        { type: 'toggle', path: `${base}.useThemeColors`, label: 'Use global theme colours' },
      ], advanced: [
        { type: 'color', path: `${base}.colors.primary`, label: 'Primary' },
        { type: 'color', path: `${base}.colors.secondary`, label: 'Secondary' },
        { type: 'color', path: `${base}.colors.text`, label: 'Text' },
      ]},
      { title: 'ELEMENTS', controls: Object.keys(state.goals?.items?.[key]?.elements ?? {}).map((k) => ({
        type: 'toggle', path: `${base}.elements.${k}`, label: k[0].toUpperCase() + k.slice(1),
      }))},
    ])}`;
}

function widgetsPage(state) {
  return `
    <p class="dash-panel__intro">Placement and scale for the widgets that carry them. Positions are presets with authored safe margins — there is no freeform dragging, so nothing can be pushed off the canvas.</p>
    ${cards([
      { title: 'BRAND BAR', reset: 'widgets.brandBar', controls: [
        { type: 'toggle', path: 'widgets.brandBar.enabled', label: 'Enabled' },
        { type: 'position', path: 'widgets.brandBar.position', label: 'Position', options: POS_ALL, allowed: POSITIONS_FOR.brandBar },
        { type: 'range', path: 'widgets.brandBar.scale', label: 'Scale', min: SCALE_RANGE.brandBar.min, max: SCALE_RANGE.brandBar.max, step: 0.05 },
      ]},
      { title: 'SYSTEM STRIP', reset: 'widgets.systemStrip', controls: [
        { type: 'toggle', path: 'widgets.systemStrip.enabled', label: 'Enabled' },
        { type: 'position', path: 'widgets.systemStrip.position', label: 'Position', options: POS_ALL, allowed: POSITIONS_FOR.systemStrip },
      ]},
      { title: 'GOAL RAIL', reset: ['widgets.goalRail', 'goals.railGoal'], controls: [
        { type: 'toggle', path: 'widgets.goalRail.enabled', label: 'Enabled' },
        { type: 'select', path: 'goals.railGoal', label: 'Which goal', options: Object.keys(state.goals?.items ?? {}).map((k) => [k, k.toUpperCase()]) },
        { type: 'position', path: 'widgets.goalRail.position', label: 'Position', options: POS_ALL, allowed: POSITIONS_FOR.goal },
      ]},
      { title: 'ACTIVITY', reset: 'activity', controls: [
        { type: 'toggle', path: 'activity.enabled', label: 'Enabled' },
        { type: 'segmented', path: 'activity.mode', label: 'Mode', options: [['tiles', 'TILES'], ['list', 'RECENT EVENTS']] },
        { type: 'range', path: 'activity.maxEvents', label: 'Max events', min: 1, max: 10, step: 1 },
        { type: 'position', path: 'activity.position', label: 'Position', options: POS_ALL, allowed: POSITIONS_FOR.activity },
      ], advanced: [
        { type: 'toggle', path: 'activity.compact', label: 'Compact rows' },
        { type: 'toggle', path: 'activity.elements.icon', label: 'Icons' },
        { type: 'toggle', path: 'activity.elements.label', label: 'Labels' },
        { type: 'toggle', path: 'activity.elements.timestamp', label: 'Timestamps' },
        { type: 'range', path: 'activity.scale', label: 'Scale', min: SCALE_RANGE.activity.min, max: SCALE_RANGE.activity.max, step: 0.05 },
      ]},
      { title: 'RECENT EVENTS', reset: ['activity.categories', 'activity.events'], controls: [
        { type: 'note', label: 'Which events reach the list when Activity is set to RECENT EVENTS. Turning a type off hides it immediately, including ones already on screen. RESET turns every type back on and clears the list.' },
        ...ALERT_TYPES.map((t) => ({ type: 'toggle', path: `activity.categories.${t}`, label: ALERT_LABELS[t] })),
      ], advanced: [
        { type: 'note', label: 'The list holds the last 20 events of this session. It is never written to disk, so restarting the overlay starts it empty rather than replaying yesterday.' },
      ]},
      { title: 'WEBCAM FRAME', reset: 'widgets.webcam', controls: [
        { type: 'toggle', path: 'widgets.webcam.enabled', label: 'Enabled' },
        { type: 'note', label: 'The webcam frame is not scalable: its opening is a transparent cutout at an authored position, and moving or resizing it would leave the camera behind it out of register.' },
      ]},
      { title: 'SETUP AIDS', controls: [
        { type: 'toggle', path: 'display.showSafeArea', label: 'Safe-area guides', hint: 'Turn off before going live' },
        { type: 'toggle', path: 'display.showSampleGameplay', label: 'Sample gameplay plate' },
        { type: 'toggle', path: 'display.showCameraPlaceholder', label: 'Camera placeholder', hint: 'Covers a live camera — setup only' },
      ]},
    ])}`;
}

function integrationsPage(state) {
  /* Rendered from live server status rather than a hardcoded list, so a
     source can never be shown as connected when it is not. `ui.sources` is
     refreshed by pollIntegrations() below. */
  const sources = (ui.sources ?? []).map((src) => {
    const tone = { linked: 'var(--cyan)', pending: 'var(--amber)', error: 'var(--magenta)', off: 'rgba(255,255,255,.2)' }[src.state];
    const tag = { linked: 'CONNECTED', pending: 'WAITING', error: 'PROBLEM', off: 'NOT CONNECTED' }[src.state];
    const device = ui.device?.[src.id];

    const action = src.state === 'linked' || src.state === 'pending'
      ? `<button class="ctl-btn ctl-btn--ghost" data-source-action="disconnect" data-source="${src.id}">DISCONNECT</button>`
      : `<button class="ctl-btn ctl-btn--cyan" data-source-action="connect" data-source="${src.id}">CONNECT</button>`;

    /* The device code is the whole connect flow: the server is already
       polling, so all the operator has to do is type this on the platform. */
    const codeBlock = device ? `
      <div class="dash-device">
        <div class="dash-device__label">On another device or tab, open</div>
        <a class="dash-device__url" href="${esc(device.verifyUrl)}" target="_blank" rel="noreferrer">${esc(device.verifyUrl)}</a>
        <div class="dash-device__label">and enter this code</div>
        <div class="dash-device__code">${esc(device.userCode)}</div>
        <div class="dash-device__label">This page will say CONNECTED on its own once you have.</div>
      </div>` : '';

    const endpoint = src.endpoint ? `
      <div class="dash-device">
        <div class="dash-device__label">Point your other tool at this address</div>
        <div class="dash-device__url" style="user-select:all">${esc(location.origin + src.endpoint)}</div>
        <div class="dash-device__label">POST JSON, for example
          <code>{"kind":"tip","name":"someone","amount":"$5.00"}</code></div>
        <button class="ctl-btn ctl-btn--ghost" data-source-action="rotate" data-source="${src.id}" style="margin-top:10px">NEW ADDRESS</button>
      </div>` : '';

    return `
      <div class="ctl-card">
        <div class="ctl-card__title">${esc(src.label)}</div>
        <div class="dash-status" style="border-left-color:${tone}">
          <div>
            <div class="dash-status__name">${src.account ? esc(src.account) : esc(src.blurb)}</div>
            <div class="dash-status__hint">${esc(src.detail || (src.account ? src.blurb : ''))}</div>
          </div>
          <span class="dash-tag dash-tag--${src.state === 'linked' ? 'live' : 'planned'}">${tag}</span>
        </div>
        ${codeBlock}${endpoint}
        <div class="ctl-btn-row" style="margin-top:12px">${action}</div>
      </div>`;
  }).join('');

  const owned = (ui.owned ?? []).length ? `
    <p class="dash-panel__intro" style="margin:14px 0 0;font-size:13px">
      A connected source owns the numbers it reports. Those fields are shown read-only
      on Live Control rather than letting an edit be overwritten by the next event.</p>` : '';

  return `
    <p class="dash-panel__intro">Where event data comes from. Styling never lives here — a source supplies values like “follower = Adem”, and everything visual stays in Theme, Alerts, Chat and Goals. That separation is what lets a live source drop in without redoing any of your customisation.</p>
    <div class="dash-grid dash-grid--sources">
      ${sources || '<div class="ctl-card"><div class="ctl-card__title">DATA SOURCES</div><p class="dash-panel__intro" style="margin:0">Loading…</p></div>'}
      <div class="ctl-card"><div class="ctl-card__title">MANUAL</div>
        <div class="dash-status" style="border-left-color:var(--cyan)">
          <div><div class="dash-status__name">Dashboard</div>
          <div class="dash-status__hint">Everything you set here by hand. Always available, with or without a connected source.</div></div>
          <span class="dash-tag dash-tag--live">ALWAYS ON</span>
        </div>
        ${owned}
      </div>
      <div class="ctl-card"><div class="ctl-card__title">RESET</div>
        <p class="dash-panel__intro" style="margin:0 0 12px;font-size:13px">Puts every setting back to how the package shipped. Your uploaded artwork is kept, and connected accounts stay connected — sign out of those with DISCONNECT above.</p>
        <button class="ctl-btn ctl-btn--ghost" id="reset-everything">RESET EVERYTHING</button>
      </div>
    </div>`;
}

function themePage(state) {
  const presets = Object.entries(THEME_PRESETS).map(([k, v]) =>
    `<button class="ctl-btn" data-preset="${k}">${v.label}</button>`).join('');
  return `
    <p class="dash-panel__intro">A small set of safe global controls. They recolour and calm the package; nothing here can move or resize anything. Widgets inherit these unless you switch a widget to its own colours.</p>
    <div class="ctl-card" style="margin-bottom:16px">
      <div class="ctl-card__title">PRESETS</div>
      <div class="ctl-btn-row">${presets}</div>
      <p class="dash-panel__intro" style="margin:12px 0 0;font-size:13px">A preset just fills in the same values below — everything stays editable afterwards.</p>
    </div>
    ${cards([
      { title: 'COLOURS', reset: 'theme.colors', controls: [
        { type: 'color', path: 'theme.colors.primary', label: 'Primary accent' },
        { type: 'color', path: 'theme.colors.secondary', label: 'Secondary accent' },
        { type: 'color', path: 'theme.colors.highlight', label: 'Highlight / accent 3' },
      ], advanced: [
        { type: 'color', path: 'theme.colors.background', label: 'Background tone' },
        { type: 'color', path: 'theme.colors.text', label: 'Main text' },
        { type: 'color', path: 'theme.colors.textDim', label: 'Secondary text' },
      ]},
      { title: 'FEEL', reset: ['theme.intensity', 'theme.motionLevel', 'theme.performance'], controls: [
        { type: 'range', path: 'theme.intensity.glow', label: 'Glow intensity', min: 0, max: 2, step: 0.05 },
        { type: 'range', path: 'theme.intensity.backgroundBrightness', label: 'Background brightness', min: 0.6, max: 1.4, step: 0.02 },
        { type: 'segmented', path: 'theme.motionLevel', label: 'Motion', options: [['off', 'OFF'], ['reduced', 'REDUCED'], ['full', 'FULL']] },
        { type: 'segmented', path: 'theme.performance', label: 'Effect performance', options: [['low', 'LOW'], ['balanced', 'BALANCED'], ['high', 'HIGH']] },
      ], advanced: [
        { type: 'range', path: 'theme.intensity.panelOpacity', label: 'Panel opacity', min: 0.2, max: 1, step: 0.02 },
        { type: 'range', path: 'theme.intensity.borderBrightness', label: 'Border brightness', min: 0.2, max: 2, step: 0.05 },
        { type: 'range', path: 'theme.intensity.scanlines', label: 'Scanline intensity', min: 0, max: 0.6, step: 0.02 },
        { type: 'range', path: 'theme.intensity.motion', label: 'Motion speed', min: 0, max: 1.5, step: 0.05 },
      ]},
    ])}`;
}

/* ============================================================
   Wiring
   ============================================================ */

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

/* ---------- generated pages ---------- */
const PAGE_BUILDERS = {
  theme: themePage,
  alerts: alertsPage,
  chat: chatPage,
  goals: goalsPage,
  widgets: widgetsPage,
  integrations: integrationsPage,
};

/* Pages re-render when state changes, but only the one on screen and only
   when its markup would actually differ — otherwise typing in a field would
   rebuild the field under the cursor. */
const lastHtml = {};
function renderPages(state) {
  for (const [id, build] of Object.entries(PAGE_BUILDERS)) {
    const host = document.querySelector(`.dash-section[data-section="${id}"]`);
    if (!host) continue;
    const html = build(state);
    if (html !== lastHtml[id]) { lastHtml[id] = html; host.innerHTML = html; }
    syncControls(host, state);
    reHighlight();
  }
}

/* ---------- resets ---------- */
async function reset(kind, target) {
  /* A card may name several branches; a single control names exactly one.
     Either way the server owns the defaults, so the page never carries a
     second copy of them that could drift. */
  for (const branch of String(target).split(/\s+/).filter(Boolean)) {
    const res = await fetch(`/api/reset/${encodeURIComponent(branch)}`, { method: 'POST' }).catch(() => null);
    if (!res?.ok) {
      /* A button that silently does nothing is the worst outcome. Say what
         failed, and check whether a stale server is the reason — that is what
         it was, every time this has happened. */
      console.error(`[dashboard] reset failed for "${branch}"`, res?.status ?? 'no response');
      reportFailure(`Reset failed for “${branch}” (${res?.status ?? 'no response'}).`);
      checkServerVersion();
      return;
    }
  }
  hideFailure();
}

/* ---------- is the running server older than these files? ---------- */
const staleBanner = $('#stale-banner');
const actionError = $('#action-error');

function reportFailure(message) {
  actionError.innerHTML = `<strong>That did not work.</strong><span>${message}</span>`;
  actionError.hidden = false;
}
function hideFailure() { actionError.hidden = true; }

async function checkServerVersion() {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    /* An older server has no /api/health at all, which is itself the answer. */
    if (res.status === 404) { staleBanner.hidden = false; return; }
    if (!res.ok) return;
    const health = await res.json();
    staleBanner.hidden = !health.stale;
  } catch { /* offline; the SERVER UNREACHABLE pill already says so */ }
}

checkServerVersion();
/* Cheap, and it catches an update that lands while the page is open. */
setInterval(checkServerVersion, 60_000);

/* ---------- integrations ----------
   Status is polled rather than pushed: it changes only when someone presses
   Connect or a platform drops its socket, and a second SSE channel for that
   would be more machinery than the problem needs. */
async function pollIntegrations() {
  try {
    const res = await fetch('/api/integrations', { cache: 'no-store' });
    if (!res.ok) return;
    const body = await res.json();
    const before = JSON.stringify([ui.sources, ui.owned]);
    ui.sources = body.sources ?? [];
    ui.owned = body.owned ?? [];
    /* A source that finished linking has no further use for its device code. */
    for (const src of ui.sources) {
      if (src.state === 'linked' || src.state === 'off') delete ui.device[src.id];
    }
    if (JSON.stringify([ui.sources, ui.owned]) !== before) renderPages(editor.state);
    applyOwnership();
  } catch { /* the SERVER UNREACHABLE pill already covers this */ }
}

/* A field a live source owns must not look editable. Disabling it is the
   honest signal — the alternative is letting someone type a follower count
   that the next event silently overwrites. */
function applyOwnership() {
  const owned = new Set(ui.owned ?? []);
  for (const el of document.querySelectorAll('[data-path], [data-goal]')) {
    const path = el.dataset.path
      ?? (el.dataset.goal ? `goals.items.${el.dataset.goal.replace('.', '.')}` : '');
    const isOwned = owned.has(path);
    el.disabled = isOwned;
    el.title = isOwned
      ? 'A connected source reports this. Disconnect it on Integrations to set it by hand.'
      : '';
  }
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-source-action]');
  if (!button) return;
  const id = button.dataset.source;
  const action = button.dataset.sourceAction;
  button.disabled = true;
  try {
    const res = await fetch(`/api/integrations/${id}/${action}`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { reportFailure(body.error ?? `Could not ${action} ${id}.`); return; }
    hideFailure();
    /* A device flow hands back a code to type. The server is already polling
       for the approval, so there is nothing else for the operator to do. */
    if (body.kind === 'device') ui.device[id] = { userCode: body.userCode, verifyUrl: body.verifyUrl };
    if (action === 'disconnect') delete ui.device[id];
  } finally {
    button.disabled = false;
    await pollIntegrations();
  }
});

pollIntegrations();
setInterval(pollIntegrations, 4000);

/* ============================================================
   Live / Preview
   ============================================================
   In LIVE, every change goes straight to the server and reaches OBS. In
   PREVIEW, changes are held in a draft that only the preview frame is told
   about, so a scene can be laid out mid-stream without the audience watching
   it happen. PUSH TO LIVE sends the whole draft at once.

   The draft never touches the server, and the server never learns it exists.
   Everything downstream keeps its single owner: what OBS shows is still, at
   all times, exactly what the server holds. */
const previewFrame = $('#preview');
let frameReady = false;

/** State as the editor should show it: server state with the draft over it. */
function editorState() {
  return ui.mode === 'preview' && Object.keys(ui.draft).length
    ? merge(store.state, ui.draft)
    : store.state;
}

/** Push the current draft into the preview frame. */
function sendPreview() {
  if (!frameReady) return;
  const win = previewFrame.contentWindow;
  if (!win) return;
  if (ui.mode === 'preview') {
    win.postMessage({ channel: 'ja-preview', type: 'state', state: editorState() }, location.origin);
  } else {
    win.postMessage({ channel: 'ja-preview', type: 'clear' }, location.origin);
  }
}

window.addEventListener('message', (event) => {
  if (event.source !== previewFrame.contentWindow) return;
  if (event.data?.channel !== 'ja-preview' || event.data.type !== 'ready') return;
  /* A frame that just loaded knows nothing about the draft — resend it. */
  frameReady = true;
  sendPreview();
});
/* A scene change reloads the frame, so it must announce itself again. */
previewFrame.addEventListener('load', () => { frameReady = false; });

/**
 * What every control writes through. In live mode it is the store; in preview
 * it is the draft. Controls never learn which, so there is one write path.
 */
const editor = {
  get state() { return editorState(); },
  get config() { return store.config; },
  get capabilities() { return store.capabilities; },
  commit(patch) {
    if (ui.mode === 'live') return store.commit(patch);
    ui.draft = merge(ui.draft, patch);
    refreshEditor();
    return true;
  },
  fireAlert(alert) {
    /* In preview a test alert plays in the frame only, which is the whole
       point: nobody watching sees a fake follower. */
    if (ui.mode === 'live') return store.fireAlert(alert);
    previewFrame.contentWindow?.postMessage(
      { channel: 'ja-preview', type: 'alert', alert }, location.origin);
    return true;
  },
};

/** Re-render the pages and the preview from the draft-merged state. */
function refreshEditor() {
  const state = editorState();
  applyTheme(state.theme);
  renderPages(state);
  syncPlainInputs(state);
  sendPreview();
  updateModeBar();
}

function updateModeBar() {
  const pending = Object.keys(ui.draft).length > 0;
  const preview = ui.mode === 'preview';
  $('#mode-bar').classList.toggle('is-preview', preview);
  for (const b of document.querySelectorAll('[data-mode]')) {
    b.classList.toggle('is-active', b.dataset.mode === ui.mode);
  }
  $('#mode-actions').hidden = !preview;
  $('#push-live').disabled = !pending;
  $('#mode-note').textContent = preview
    ? (pending ? 'Held back from OBS. Push when you are happy.' : 'Changes will be held back from OBS.')
    : 'Changes reach OBS as you make them.';
}

document.addEventListener('click', (event) => {
  const opt = event.target.closest('[data-mode]');
  if (opt) {
    const next = opt.dataset.mode;
    if (next === ui.mode) return;
    if (next === 'live' && Object.keys(ui.draft).length) {
      /* Switching to live with a draft pending would either lose it or push
         it silently. Ask, because both are surprising. */
      if (!confirm('Push your held changes to OBS?\n\nCancel keeps them in preview.')) return;
      store.commit(ui.draft);
    }
    ui.mode = next;
    ui.draft = {};
    refreshEditor();
    return;
  }
  if (event.target.closest('#push-live')) {
    if (!Object.keys(ui.draft).length) return;
    store.commit(ui.draft);
    ui.draft = {};
    ui.mode = 'live';
    refreshEditor();
    return;
  }
  if (event.target.closest('#discard-draft')) {
    if (Object.keys(ui.draft).length && !confirm('Discard your held changes?')) return;
    ui.draft = {};
    refreshEditor();
  }
});

/* ---------- the info panel ----------
   Detail goes under the preview rather than in a tooltip: there is room for a
   real sentence there, it does not cover the control being asked about, and it
   stays put while the setting is adjusted. */
function showHelp(path) {
  const entry = helpFor(path);
  const panel = $('#help-panel');
  if (!entry) return;
  ui.help = path;
  panel.innerHTML = `
    <div class="dash-help__card">
      <div class="dash-help__title">${esc(entry.title)}</div>
      <p class="dash-help__body">${esc(entry.body)}</p>
      ${entry.note ? `<p class="dash-help__note">${esc(entry.note)}</p>` : ''}
      <div class="dash-help__path">${esc(path)}</div>
    </div>`;
  for (const b of document.querySelectorAll('[data-help]')) {
    b.classList.toggle('is-active', b.dataset.help === path);
  }
}

document.addEventListener('click', (event) => {
  const info = event.target.closest('[data-help]');
  if (!info) return;
  /* Inside a <label>, a click would otherwise be forwarded to the input. */
  event.preventDefault();
  event.stopPropagation();
  showHelp(info.dataset.help);
});

/* Re-highlight the open entry after a page rebuilds its controls. */
const reHighlight = () => {
  if (!ui.help) return;
  for (const b of document.querySelectorAll('[data-help]')) {
    b.classList.toggle('is-active', b.dataset.help === ui.help);
  }
};

bindControls(document.querySelector('.dash-panel'), editor, { onReset: reset });

document.addEventListener('click', async (event) => {
  const preset = event.target.closest('[data-preset]');
  if (preset) {
    const chosen = THEME_PRESETS[preset.dataset.preset];
    if (chosen) editor.commit({ theme: { colors: { ...chosen.colors }, preset: preset.dataset.preset } });
    return;
  }
  const alertTab = event.target.closest('[data-alert-type]');
  if (alertTab) { ui.alertType = alertTab.dataset.alertType; renderPages(editor.state); return; }

  const goalTab = event.target.closest('[data-goal-key]');
  if (goalTab) { ui.goalKey = goalTab.dataset.goalKey; renderPages(editor.state); return; }

  if (event.target.closest('#reset-everything')) {
    if (!confirm('Reset every setting to defaults?\n\nYour uploaded artwork is kept — only the Clear button on the Branding page removes a file.')) return;
    await fetch('/api/reset', { method: 'POST' }).catch(() => {});
  }
});

/* ---------- preview test data ---------- */
$('#test-alert').addEventListener('click', () => {
  const kind = ui.alertType;
  editor.fireAlert({ kind, ...DEMO_EVENT[kind] });
});
$('#test-chat').addEventListener('click', () => {
  const demo = config.chat.demoMessages;
  const msg = { ...demo[Math.floor(Math.random() * demo.length)], at: new Date().toTimeString().slice(0, 5) };
  const messages = [msg, ...(editor.state.chat.messages ?? [])].slice(0, 20);
  editor.commit({ chat: { messages } });
});
$('#test-goal').addEventListener('click', () => {
  const key = ui.goalKey;
  const goal = editor.state.goals.items[key];
  editor.commit({ goals: { items: { [key]: { current: Math.min(goal.target, goal.current + Math.ceil(goal.target * 0.08)) } } } });
});
$('#reset-preview').addEventListener('click', () => {
  editor.commit({ chat: { messages: [...config.chat.demoMessages] } });
});

/* ---------- live control ---------- */
for (const input of document.querySelectorAll('[data-path]')) {
  const isNumber = input.type === 'number' || input.type === 'range';
  input.addEventListener('input', () => editor.commit(patchFor(input.dataset.path, isNumber ? Number(input.value) : input.value)));
}
for (const toggle of document.querySelectorAll('[data-toggle]')) {
  toggle.addEventListener('click', () => editor.commit(patchFor(toggle.dataset.toggle, !readPath(editor.state, toggle.dataset.toggle))));
}
$('#go-live').addEventListener('click', () => editor.commit({ stream: { startedAt: Date.now() } }));
$('#end-stream').addEventListener('click', () => editor.commit({ stream: { startedAt: null } }));
$('#countdown').addEventListener('input', (event) => {
  const minutes = event.target.value.trim();
  editor.commit({ stream: { countdownSeconds: minutes === '' ? null : Math.round(Number(minutes) * 60) } });
});

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
  input.addEventListener('input', () => editor.commit({ goals: { items: { [key]: { [field]: Number(input.value) } } } }));
}

const TILE_FOR = { follower: 'follower', sub: 'sub', tip: 'tip' };
for (const button of document.querySelectorAll('[data-alert]')) {
  button.addEventListener('click', () => {
    const kind = button.dataset.alert;
    const name = $('#alert-name').value.trim() || 'someone';
    const amount = $('#alert-amount').value.trim();
    const message = $('#alert-message').value.trim();
    editor.fireAlert({ kind, name, amount: amount || undefined, message: message || undefined });
    const tile = TILE_FOR[kind];
    if (tile) editor.commit({ activity: { tiles: { [tile]: { value: kind === 'tip' && amount ? `${name} · ${amount}` : name } } } });
  });
}

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
    const res = await fetch(`/api/branding/${slot}`, { method: 'POST', headers: { 'content-type': file.type }, body: file });
    const body = await res.json();
    if (!res.ok) say(body.error ?? `Upload failed (${res.status})`, true);
  } catch (err) { say(`Upload failed: ${err.message}`, true); }
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
    input.value = readPath(editor.state, input.dataset.sceneField) ?? '';
    input.addEventListener('input', () => editor.commit(patchFor(input.dataset.sceneField, input.value)));
  }
}

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

function copy(text, button) {
  const done = () => { const old = button.textContent; button.textContent = 'COPIED'; setTimeout(() => { button.textContent = old; }, 1200); };
  navigator.clipboard?.writeText(text).then(done).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } finally { ta.remove(); }
  });
}
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-copy]');
  if (button) copy(button.dataset.copy, button);
});

/* ---------- render ---------- */
/** The hand-written Live Control inputs, which are not built by controls.js. */
function syncPlainInputs(state) {
  for (const input of document.querySelectorAll('[data-path]')) {
    if (document.activeElement === input) continue;
    const value = readPath(state, input.dataset.path);
    if (value !== undefined) input.value = value;
  }
  for (const toggle of document.querySelectorAll('[data-toggle]')) {
    toggle.classList.toggle('is-on', Boolean(readPath(state, toggle.dataset.toggle)));
  }
}

store.subscribe((serverState) => {
  /* In preview the draft sits over server state, so the editor keeps showing
     what is being worked on even as live values arrive underneath. */
  const state = editorState();
  /* The dashboard wears the theme it is editing. */
  applyTheme(state.theme);
  renderPages(state);
  syncPlainInputs(state);
  sendPreview();
  updateModeBar();

  for (const { key } of GOAL_KEYS) {
    const goal = state.goals.items[key];
    const pct = goalPercent(goal);
    for (const field of ['current', 'target']) {
      const input = document.querySelector(`[data-goal="${key}.${field}"]`);
      if (input && document.activeElement !== input) input.value = goal[field];
    }
    document.querySelector(`[data-goal-fill="${key}"]`).style.width = `${pct}%`;
    document.querySelector(`[data-goal-readout="${key}"]`).textContent = goalReadout(goal);
    document.querySelector(`[data-goal-pct="${key}"]`).textContent = `${Math.round(pct)}%`;
  }

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
      meta.textContent = entry?.file ? `${entry.file} · ${(entry.bytes / 1024).toFixed(0)} KB` : hint;
    }
  }

  for (const input of document.querySelectorAll('[data-scene-field]')) {
    if (document.activeElement === input) continue;
    input.value = readPath(state, input.dataset.sceneField) ?? '';
  }

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
  const ms = uptimeMs(editor.state.stream, Date.now());
  $('#uptime-readout').textContent = ms === null ? '--:--:--' : formatDuration(ms);
  $('#caffeine-readout').textContent = `${caffeinePercent(editor.state.caffeine, editor.state.stream)}%`;
}, 1000);

selectScene(activeScene);
