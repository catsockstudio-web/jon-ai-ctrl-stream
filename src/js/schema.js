/* ============================================================
   schema.js — the shape of everything, and how old state
   becomes new state.

   Two rules hold this together:

   1. GLOBAL THEME sets the package's identity. Widgets inherit
      from it by default.
   2. A WIDGET OVERRIDE may replace selected theme values for
      one widget. `useThemeColors: true` means "inherit"; set it
      false and that widget's own colours win.

   Nothing here knows about providers. A provider supplies event
   values (who followed, how much they gave); everything visual
   lives in this state and is set locally.
   ============================================================ */

export const SCHEMA_VERSION = 2;

/* Positions every widget can be asked to sit at. Each widget exposes only
   the subset that makes sense for it — see POSITIONS_FOR. */
export const POSITIONS = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

/* Authored safe margin from the canvas edge, in 1920x1080 pixels (§09). */
export const SAFE_MARGIN = 32;

export const POSITIONS_FOR = {
  alerts: POSITIONS,
  chat: ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right'],
  goal: ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'],
  activity: ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'],
  brandBar: ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-right'],
  systemStrip: ['top-left', 'top-center', 'top-right'],
};

/* Scale ranges, chosen so nothing can be pushed off a 1920x1080 canvas. */
export const SCALE_RANGE = {
  alerts: { min: 0.7, max: 1.5 },
  chat: { min: 0.75, max: 1.25 },
  goal: { min: 0.6, max: 1.5 },
  activity: { min: 0.7, max: 1.3 },
  brandBar: { min: 0.8, max: 1.2 },
};

/* Only fonts already loaded by the package. No remote URLs, ever: an overlay
   must look the same with the network unplugged. */
export const FONT_STACKS = {
  display: "var(--font-display)",
  ui: "var(--font-ui)",
  mono: "var(--font-mono)",
};

/* ---------- effects ----------
   Ordered cheapest-first. `cost` drives what the LOW and BALANCED
   performance presets are allowed to run. */
export const EFFECTS = {
  /* baseline: never suppressed by performance mode or motion level. Without
     one effect that always survives, LOW reads as a broken overlay rather
     than a cheap one. Switching it off by hand still switches it off. */
  glow:        { label: 'Glow / Bloom',     cost: 'low',    animated: false, baseline: true, controls: ['intensity', 'radius'] },
  edgeTrace:   { label: 'Edge Trace',       cost: 'low',    animated: true,  controls: ['speed', 'brightness'] },
  flicker:     { label: 'Flicker',          cost: 'low',    animated: true,  controls: ['intensity', 'frequency'] },
  scanlines:   { label: 'Scanlines',        cost: 'low',    animated: false, controls: ['opacity', 'spacing', 'speed'] },
  rgbSplit:    { label: 'RGB / Chromatic',  cost: 'medium', animated: false, controls: ['offsetX', 'offsetY', 'intensity'] },
  ghosting:    { label: 'Ghosting',         cost: 'medium', animated: true,  controls: ['offset', 'opacity', 'decay'] },
  vhsSlice:    { label: 'VHS Slice / Tear', cost: 'medium', animated: true,  controls: ['intensity', 'frequency', 'displacement'] },
  crt:         { label: 'CRT Distortion',   cost: 'high',   animated: true,  controls: ['intensity', 'curvature', 'flicker'] },
  noise:       { label: 'Noise / Static',   cost: 'high',   animated: true,  controls: ['intensity', 'frequency'] },
};

/* What each performance preset permits. LOW keeps the package readable on a
   machine that is already encoding video; HIGH is for headroom. */
export const PERFORMANCE = {
  low:      { allow: ['low'],                   label: 'LOW — cheapest effects only' },
  balanced: { allow: ['low', 'medium'],         label: 'BALANCED — recommended' },
  high:     { allow: ['low', 'medium', 'high'], label: 'HIGH — everything' },
};

const effectDefaults = () => ({
  glow:      { on: true,  intensity: 1,   radius: 24 },
  edgeTrace: { on: true,  speed: 3.4, brightness: 1 },
  flicker:   { on: false, intensity: 0.4, frequency: 6 },
  scanlines: { on: false, opacity: 0.12, spacing: 4, speed: 0 },
  rgbSplit:  { on: false, offsetX: 2, offsetY: 0, intensity: 0.8 },
  ghosting:  { on: false, offset: 6, opacity: 0.35, decay: 420 },
  vhsSlice:  { on: false, intensity: 0.6, frequency: 3, displacement: 8 },
  crt:       { on: false, intensity: 0.5, curvature: 0.4, flicker: 0.3 },
  noise:     { on: false, intensity: 0.15, frequency: 12 },
});

/* ---------- alerts ---------- */

export const ALERT_TYPES = ['follower', 'sub', 'tip', 'bits', 'raid', 'giftSub'];

/* Tokens a template may use. Anything else is left as written rather than
   blanked, so a typo is visible instead of silently eating text. */
export const TEMPLATE_TOKENS = ['{name}', '{amount}', '{message}', '{tier}', '{count}'];

const ALERT_PRESETS = {
  follower: { title: 'NEW FOLLOWER',  template: '{name}',            accent: 'primary' },
  sub:      { title: 'SUBSCRIBER',    template: '{name}',            accent: 'secondary' },
  tip:      { title: 'COFFEE FUND · {amount}', template: '{name}',   accent: 'highlight' },
  bits:     { title: 'BITS',          template: '{name}',            accent: 'magenta' },
  raid:     { title: 'RAID · {count} VIEWERS', template: '{name}',   accent: 'secondary' },
  giftSub:  { title: 'GIFT SUBS · {count}',    template: '{name}',   accent: 'primary' },
};

/* Demo values, used by the dashboard's preview buttons and by any alert that
   arrives without a field. Clearly test data — never presented as real. */
export const DEMO_EVENT = {
  follower: { name: 'kayla_tx',    amount: '',       message: '', tier: '', count: '' },
  sub:      { name: 'n0de_runner', amount: '',       message: 'third month!', tier: 'TIER 1', count: '3' },
  tip:      { name: 'dallas_dev',  amount: '$5.00',  message: 'next round is on me', tier: '', count: '' },
  bits:     { name: 'tinygoose',   amount: '500',    message: '', tier: '', count: '500' },
  raid:     { name: 'brewbot_9',   amount: '',       message: '', tier: '', count: '42' },
  giftSub:  { name: 'ctrl_alt_jen', amount: '',      message: '', tier: 'TIER 1', count: '5' },
};

/* ---------- recent events ---------- */

/* How many events the server keeps. The widget shows at most `maxEvents`;
   the extra headroom means lowering that setting reveals history that is
   already there instead of starting the list over. */
export const EVENT_RING = 20;

export const ACTIVITY_MODES = ['tiles', 'list'];

/* Row styling per event type. The icon is a text glyph on purpose — the
   package must not require an image file to draw its own UI. */
export const EVENT_META = {
  follower: { icon: '+', label: 'followed',   accent: 'primary'   },
  sub:      { icon: '\u2605', label: 'subscribed', accent: 'secondary' },
  tip:      { icon: '\u25C6', label: 'tipped',     accent: 'highlight' },
  bits:     { icon: '\u25B2', label: 'cheered',    accent: 'magenta'   },
  raid:     { icon: '\u00BB', label: 'raided',     accent: 'secondary' },
  giftSub:  { icon: '\u2726', label: 'gifted',     accent: 'primary'   },
};

/* What the list shows next to a name, per type. Same token rules as alert
   templates: an unknown token is left visible rather than blanked. */
export const EVENT_TEMPLATES = {
  follower: '',
  sub:      '{tier}',
  tip:      '{amount}',
  bits:     '{amount}',
  raid:     '{count} viewers',
  giftSub:  '{count}',
};

function alertDefaults(type) {
  const preset = ALERT_PRESETS[type];
  return {
    enabled: type === 'raid' || type === 'giftSub' ? false : true,
    title: preset.title,
    template: preset.template,
    secondary: '{message}',
    duration: 5000,
    scale: 1,
    position: 'top-center',
    entrance: 'slide',
    exit: 'fade',
    animationMs: 320,
    useThemeColors: true,
    colors: { primary: null, secondary: null, text: null },
    /* Which accent this type borrows from the theme when inheriting. */
    accent: preset.accent,
    elements: { icon: true, label: true, name: true, amount: true, message: true, border: true, panel: true },
    effects: effectDefaults(),
  };
}

/* ---------- goals ---------- */

export const GOAL_TYPES = ['follower', 'sub', 'tip', 'bits', 'custom'];

function goalDefaults(id, label, current, target, mode) {
  return {
    enabled: true,
    type: id === 'coffee' ? 'tip' : id,
    label,
    current,
    target,
    mode,                     /* rail | segmented | mug */
    segments: 10,
    prefix: id === 'coffee' ? '$' : '',
    orientation: 'horizontal',
    alignment: 'center',
    scale: 1,
    thickness: 6,
    radius: 3,
    useThemeColors: true,
    colors: { primary: null, secondary: null, text: null },
    elements: { label: true, current: true, target: true, percentage: true, icon: false, frame: false, glow: true, animate: true },
  };
}

/* ---------- the whole default document ---------- */

export function defaults(config) {
  return {
    version: SCHEMA_VERSION,

    theme: {
      colors: {
        primary:   '#8B4DFF',
        secondary: '#22E6E0',
        highlight: '#F0A855',
        background:'#0A0A0F',
        text:      '#EAEAF2',
        textDim:   '#8E8FA6',
      },
      intensity: {
        glow: 1,
        panelOpacity: 0.82,
        backgroundBrightness: 1,
        borderBrightness: 1,
        scanlines: 0,
        motion: 1,
      },
      motionLevel: 'full',          /* full | reduced | off */
      performance: 'balanced',
      preset: 'default',
    },

    alerts: Object.fromEntries(ALERT_TYPES.map((t) => [t, alertDefaults(t)])),

    chat: {
      enabled: true,
      mode: 'panel',                /* panel | transparent */
      scale: 1,
      position: 'top-right',
      maxMessages: 7,
      typography: { family: 'ui', size: 20, weight: 400, lineHeight: 1.3, spacing: 14 },
      colors: {
        useThemeColors: true,
        text: null,
        usernameMode: 'provider',   /* provider | theme | single */
        usernameColor: '#B95CF0',
        background: null,
        backgroundOpacity: 0.8,
        border: null,
        header: null,
      },
      elements: { header: true, viewerCount: true, rail: true, timestamps: false, badges: true, rounded: true },
      animation: { style: 'rise', speed: 200, distance: 8 },
      /* Demo content so a fresh install looks populated; clearly test data,
         and replaced wholesale once a chat provider is connected. */
      /* Marked so a live source can tell its own messages from the seed. The
         package must look finished before anything is connected, but the
         moment real chat arrives, fake viewers alongside real ones would be
         on stream — so the seed is identifiable and gets dropped. */
      messages: config.chat.demoMessages.map((m) => ({ ...m, demo: true })),
    },

    goals: {
      items: {
        follower: goalDefaults('follower', 'GOAL // 250 FOLLOWERS', 214, 250, 'rail'),
        sub:      goalDefaults('sub', 'SUB GOAL', 18, 30, 'segmented'),
        coffee:   goalDefaults('coffee', 'COFFEE FUND', 68, 120, 'mug'),
      },
      /* Which goal the gameplay rail shows. */
      railGoal: 'follower',
    },

    activity: {
      enabled: true,
      mode: 'tiles',                /* tiles | list */
      maxEvents: 3,
      compact: false,
      scale: 1,
      /* Anchored from the left because the sheet puts the tiles just clear of
         the camera opening, not centred. gameplay.html supplies the offset. */
      position: 'bottom-left',
      elements: { icon: true, label: true, timestamp: false },
      categories: Object.fromEntries(ALERT_TYPES.map((t) => [t, true])),
      /* The three gameplay tiles. A live provider replaces these values; the
         labels and accents stay local configuration. */
      /* Same reasoning as the chat seed: a tile reading "LATEST FOLLOWER:
         mothwing" on a live stream is worse than an empty one. */
      tiles: Object.fromEntries(Object.entries(config.activity)
        .map(([k, v]) => [k, { ...v, demo: true }])),
      events: [],
    },

    widgets: {
      brandBar:    { enabled: true, position: 'top-left', scale: 1 },
      systemStrip: { enabled: true, position: 'top-right', scale: 1 },
      webcam:      { enabled: true, scale: 1 },
      goalRail:    { enabled: true, position: 'bottom-center', scale: 1 },
      alerts:      { enabled: true },
      chat:        { enabled: true },
      activity:    { enabled: true },
    },

    channel:  { ...config.channel },
    stream:   { ...config.stream },
    caffeine: { ...config.caffeine },
    branding: { ...config.branding },

    display: {
      showSafeArea: false,
      showSampleGameplay: false,
      showCameraPlaceholder: false,
    },

    providers: { active: 'manual' },
  };
}

/* ---------- migration ----------
   Existing installs must not lose settings. v1 is the flat-ish shape the
   package shipped with; anything without a version is v1. */

/**
 * Fill in keys a saved document is missing, without touching what it has.
 *
 * This is what lets a new setting ship without a version bump: an existing
 * document gains the new key at its default and keeps every choice already
 * made. Arrays are taken from the saved document whole — merging a list of
 * chat messages item by item would be nonsense.
 */
function topUp(base, saved) {
  if (Array.isArray(base) || Array.isArray(saved)) return saved ?? base;
  if (!isPlainObject(base)) return saved === undefined ? base : saved;
  if (!isPlainObject(saved)) return base;
  const out = { ...saved };
  for (const [key, value] of Object.entries(base)) {
    out[key] = topUp(value, saved[key]);
  }
  return out;
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function migrate(saved, config) {
  if (!saved || typeof saved !== 'object') return defaults(config);
  const version = Number(saved.version) || 1;
  if (version >= SCHEMA_VERSION) {
    /* An early v2 document named the follower category "follow". Carry the
       choice over rather than silently resetting it to on. */
    const cats = saved.activity?.categories;
    if (cats && cats.follow !== undefined && cats.follower === undefined) {
      cats.follower = cats.follow;
      delete cats.follow;
    }
    return topUp(defaults(config), saved);
  }

  const next = defaults(config);
  const carry = (from, to) => { if (from !== undefined && from !== null) return from; return to; };

  /* Text and session values moved wholesale. */
  next.channel  = { ...next.channel, ...(saved.channel ?? {}) };
  next.stream   = { ...next.stream, ...(saved.stream ?? {}) };
  next.caffeine = { ...next.caffeine, ...(saved.caffeine ?? {}) };
  next.branding = { ...next.branding, ...(saved.branding ?? {}) };
  next.display  = { ...next.display, ...(saved.display ?? {}) };

  /* v1 theme was five flat keys. */
  const t = saved.theme ?? {};
  next.theme.colors.primary   = carry(t.accent, next.theme.colors.primary);
  next.theme.colors.secondary = carry(t.accentAlt, next.theme.colors.secondary);
  next.theme.intensity.glow   = carry(t.glow, next.theme.intensity.glow);
  next.theme.intensity.backgroundBrightness = carry(t.background, next.theme.intensity.backgroundBrightness);
  if (t.motion) next.theme.motionLevel = t.motion;

  /* v1 modules{} became widgets{}.enabled. */
  const m = saved.modules ?? {};
  for (const [key, widget] of Object.entries(next.widgets)) {
    if (m[key] !== undefined) widget.enabled = Boolean(m[key]);
  }
  if (m.activityTiles !== undefined) next.widgets.activity.enabled = Boolean(m.activityTiles);
  if (m.chat !== undefined) next.chat.enabled = Boolean(m.chat);

  /* v1 goals were bare value objects. */
  for (const [key, goal] of Object.entries(saved.goals ?? {})) {
    if (!next.goals.items[key]) continue;
    Object.assign(next.goals.items[key], {
      label: carry(goal.label, next.goals.items[key].label),
      current: carry(goal.current, next.goals.items[key].current),
      target: carry(goal.target, next.goals.items[key].target),
      mode: carry(goal.mode, next.goals.items[key].mode),
      prefix: carry(goal.prefix, next.goals.items[key].prefix),
    });
  }

  /* v1 chat carried only a message list and a cap. */
  if (saved.chat?.maxMessages) next.chat.maxMessages = saved.chat.maxMessages;
  if (Array.isArray(saved.chat?.messages)) next.chat.messages = saved.chat.messages;
  if (saved.display?.chatGround) next.chat.mode = saved.display.chatGround;

  /* v1 activity{} was the three gameplay tiles. */
  if (saved.activity) {
    next.activity.tiles = saved.activity;
  }

  next.version = SCHEMA_VERSION;
  return next;
}
