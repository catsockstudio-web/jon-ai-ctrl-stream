/* ============================================================
   components.js — the §09 COMPONENT INVENTORY as markup.

   Pure functions: state in, HTML string out. No provider access, no
   DOM queries, no side effects. Both the full scenes and the
   standalone module pages render from these, so a module positioned
   separately in OBS is pixel-identical to its place in a scene.
   ============================================================ */

import { escapeHtml, goalPercent, goalReadout, formatClock } from './format.js';
import { widgetColors, renderTemplate, placement } from './resolve.js';
import { EVENT_META, EVENT_TEMPLATES } from './schema.js';

const CHAT_COLOURS = {
  purple:  'var(--purple)',
  cyan:    'var(--cyan)',
  blue:    'var(--blue)',
  magenta: 'var(--magenta)',
  amber:   'var(--amber)',
  violet:  'var(--violet)',
};

/* ---------- Avatar (eye-pair fallback / avatar.png override) ---------- */
export function avatar({ size = 56 } = {}) {
  const scale = size / 56;
  return `
    <div class="ja-avatar" data-asset="avatar" style="width:${size}px;height:${size}px">
      <span class="ja-avatar__eye ja-avatar__eye--l" style="top:${24 * scale}px;left:${13 * scale}px;width:${9 * scale}px;height:${9 * scale}px"></span>
      <span class="ja-avatar__eye ja-avatar__eye--r" style="top:${24 * scale}px;left:${33 * scale}px;width:${9 * scale}px;height:${9 * scale}px"></span>
    </div>`;
}

/* ---------- BrandBar — 344 x 76 @ 32,32 ---------- */
export function brandBar(state) {
  const { channel, stream } = state;
  const live = Boolean(stream.startedAt);
  return `
    <div class="ja-brand-bar">
      ${avatar({ size: 56 })}
      <div class="ja-brand-bar__text">
        <div class="ja-brand-bar__wordmark">${escapeHtml(channel.wordmark)}</div>
        <div class="ja-brand-bar__status">
          <span class="ja-dot${live ? '' : ' ja-dot--offline'}"></span>
          <span class="ja-brand-bar__show">${escapeHtml(channel.showName)}</span>
          <span>// ${live ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
      </div>
    </div>`;
}

/* ---------- SystemStrip — h44, right-aligned @ y32 ---------- */
/* Uptime and caffeine are time-derived, so they render as placeholders and
   are patched in place by the ticker (widgets.js) — immediately on mount and
   once a second after. Keeping them out of the rendered string means the
   scene's markup only changes when the operator changes something, so a
   ticking clock never restarts the scene's animations. */
export function systemStrip(state) {
  return `
    <div class="ja-system-strip">
      <div class="ja-system-strip__cell">UPTIME <span class="ja-system-strip__value" data-bind="uptime">--:--:--</span></div>
      <div class="ja-system-strip__cell">CAFFEINE <span class="ja-system-strip__value--amber" data-bind="caffeine">--%</span></div>
      <div class="ja-system-strip__cell">NODE <span class="ja-system-strip__value--cyan">${escapeHtml(state.channel.node)}</span></div>
    </div>`;
}

/* ---------- ChatBox — 360 x 680 @ 1528,120 ---------- */
export function chatMessage(msg, cfg = {}, theme = {}) {
  const colors = cfg.colors ?? {};
  const el = cfg.elements ?? {};
  const anim = cfg.animation ?? {};

  /* Username colour has three honest modes: whatever the provider said,
     the theme's own accents, or one fixed colour. */
  /* A live platform sends a hex; the bundled demo palette uses names. Both
     are honoured, so a real Twitch username keeps the colour its owner chose
     instead of collapsing to the fallback. */
  let author = /^#[0-9a-f]{6}$/i.test(msg.color ?? '')
    ? msg.color
    : (CHAT_COLOURS[msg.color] ?? 'var(--purple)');
  if (colors.usernameMode === 'single') author = colors.usernameColor ?? author;
  else if (colors.usernameMode === 'theme') author = msg.color === 'cyan' || msg.color === 'blue' ? (theme.secondary ?? author) : (theme.primary ?? author);
  /* 'theme' mode deliberately overrides a platform hex too — picking it means
     "make chat match my overlay", not "match it except for real users". */

  const emotes = Array.from({ length: msg.emotes ?? 0 }, () => `<span class="ja-chat__emote"></span>`).join('');
  const stamp = el.timestamps && msg.at ? `<span class="ja-chat__time">${escapeHtml(msg.at)}</span>` : '';
  const badge = el.badges !== false && msg.badge ? `<span class="ja-chat__badge">${escapeHtml(msg.badge)}</span>` : '';
  const animClass = anim.style && anim.style !== 'none' ? ` ja-chat__msg--${anim.style}` : '';

  return `
    <div class="ja-chat__msg${msg.highlight ? ' ja-chat__msg--highlight' : ''}${animClass}"${msg.fading ? ' style="opacity:.55"' : ''}>
      ${stamp}${badge}<span class="ja-chat__author" style="color:${author}">${escapeHtml(msg.author)}</span>
      <span> ${escapeHtml(msg.text)}</span>${emotes}
    </div>`;
}

/* Chat reads newest-first, top-anchored: the design's last message is the
   faded one, sitting under the 120px bottom scrim (§07 "oldest fades under
   a 120 px bottom scrim"). So `chat.messages` is in display order — index 0
   is the newest — and a live provider prepends rather than appends. */
export function chatBox(state, { width = 360, height = 680, meta = null } = {}) {
  const cfg = state.chat ?? {};
  const type = cfg.typography ?? {};
  const colors = cfg.colors ?? {};
  const el = cfg.elements ?? {};
  const transparent = cfg.mode === 'transparent';
  const limit = cfg.maxMessages ?? 7;
  const messages = (cfg.messages ?? []).slice(0, limit);
  const theme = widgetColors(state, { useThemeColors: colors.useThemeColors !== false, colors });

  const vars = [
    `--chat-size:${type.size ?? 20}px`,
    `--chat-weight:${type.weight ?? 400}`,
    `--chat-line:${type.lineHeight ?? 1.3}`,
    `--chat-gap:${type.spacing ?? 14}px`,
    `--chat-font:var(--font-${type.family ?? 'ui'})`,
    `--chat-text:${colors.text ?? theme.text}`,
    `--chat-bg-opacity:${colors.backgroundOpacity ?? 0.8}`,
    colors.background ? `--chat-bg:${colors.background}` : '',
    colors.border ? `--chat-border:${colors.border}` : `--chat-border:${theme.primary}`,
    colors.header ? `--chat-header:${colors.header}` : `--chat-header:${theme.secondary}`,
    `width:${width}px`, `height:${height}px`,
  ].filter(Boolean).join(';');

  const classes = [
    'ja-chat',
    transparent ? 'ja-chat--transparent' : '',
    el.rounded === false ? 'ja-chat--square' : '',
  ].filter(Boolean).join(' ');

  const header = el.header === false ? '' : `
      <div class="ja-panel-header">
        <span class="ja-panel-header__label">CHAT_FEED</span>
        ${el.viewerCount === false ? '' : `<span class="ja-panel-header__meta">${escapeHtml(meta ?? 'LIVE')}</span>`}
        <span class="ja-panel-header__trace"></span>
      </div>`;

  return `
    <div class="${classes}" style="${vars}">
      ${header}
      <div class="ja-chat__list" data-bind="chat-list">${messages.map((msg, i) =>
        chatMessage(i === messages.length - 1 && messages.length >= limit ? { ...msg, fading: true } : msg, cfg, theme)).join('')}</div>
      ${el.rail === false ? '' : '<div class="ja-chat__rail"></div>'}
      ${transparent ? '' : '<div class="ja-chat__scrim"></div>'}
    </div>`;
}

/* ---------- camera openings ----------
   One source of truth for where a camera shows through. A scene uses the same
   record to position its frame AND to punch its ground, so the hole and the
   border can never drift apart. Values are the §09 measurements. */
export const CAMERA_OPENINGS = {
  gameplay:     { x: 32, y: 775, width: 400,  height: 225 },
  justChatting: { x: 56, y: 300, width: 1160, height: 652 },
};

/* Frame corner radii, matching `border-radius: 2px 20px 2px 20px`. */
const FRAME_RADII = { tl: 2, tr: 20, br: 2, bl: 20 };
const ARC_STEPS = 5;

function arc(cx, cy, r, fromDeg, toDeg, out) {
  if (r <= 0) { out.push([cx, cy]); return; }
  for (let i = 0; i <= ARC_STEPS; i += 1) {
    const t = (fromDeg + (toDeg - fromDeg) * (i / ARC_STEPS)) * Math.PI / 180;
    out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
}

/**
 * A clip-path filling the whole stage EXCEPT a rounded camera opening.
 *
 * Built as a "keyhole": the outer rectangle clockwise, then the opening
 * counter-clockwise, joined by a zero-width bridge back to the origin. The
 * opposing winding is what makes the middle a hole under the default nonzero
 * fill rule. `polygon(evenodd, ...)` would say this more directly, but
 * Chromium clips the entire element away when given it — so the bridge form
 * is the one that actually works in OBS.
 */
export function groundCutout(opening, { stageWidth = 1920, stageHeight = 1080 } = {}) {
  const { x, y, width: w, height: h } = opening;
  const { tl, tr, br, bl } = FRAME_RADII;
  const ring = [];

  ring.push([x, y + tl]);
  arc(x + bl, y + h - bl, bl, 180, 90, ring);      // bottom-left
  arc(x + w - br, y + h - br, br, 90, 0, ring);    // bottom-right
  arc(x + w - tr, y + tr, tr, 0, -90, ring);       // top-right
  arc(x + tl, y + tl, tl, -90, -180, ring);        // top-left

  const px = ([a, b]) => `${a.toFixed(2)}px ${b.toFixed(2)}px`;
  const outer = [[0, 0], [stageWidth, 0], [stageWidth, stageHeight], [0, stageHeight], [0, 0]];
  return `polygon(${[...outer.map(px), ...ring.map(px), px([0, 0])].join(', ')})`;
}

/**
 * Wrap a scene's opaque background layers so `opening` can cut one genuine
 * hole through all of them at once.
 */
export function sceneGround(inner, opening = null) {
  const clip = opening ? `clip-path:${groundCutout(opening)};` : '';
  return `<div class="ja-scene__ground" style="${clip}">${inner}</div>`;
}

/* ---------- WebcamFrame — 400 x 225 @ 32,791 ---------- */
export function webcamFrame(state, { width = 400, height = 225, label = null, ticks = 16 } = {}) {
  const name = label ?? state.channel.wordmark;
  /* Off by default: the striped plate is a positioning aid, and painting it
     over a live camera is exactly the bug it used to cause. */
  const placeholder = state.display.showCameraPlaceholder ? ' ja-webcam--placeholder' : '';
  return `
    <div class="ja-webcam${placeholder}" style="width:${width}px;height:${height}px">
      <div class="ja-webcam__frame">
        <div class="ja-webcam__fallback">
          <div class="ja-webcam__fallback-id">${escapeHtml(state.channel.camLabel)}</div>
          <div class="ja-webcam__fallback-dim">${width} × ${height} · 16:9</div>
        </div>
        <div class="ja-webcam__scan"></div>
        <div class="ja-webcam__trace"></div>
      </div>
      <div class="ja-webcam__tick ja-webcam__tick--tl" style="width:${ticks}px;height:${ticks}px"></div>
      <div class="ja-webcam__tick ja-webcam__tick--br" style="width:${ticks}px;height:${ticks}px"></div>
      <div class="ja-webcam__nameplate">
        <span class="ja-dot ja-dot--magenta"></span>
        <span>${escapeHtml(name)}</span>
      </div>
    </div>`;
}

/* ---------- InfoTile — 250 x 70 ---------- */
export function infoTile(tile, { width = 250, height = 70 } = {}) {
  if (!tile) return '';
  const accent = tile.accent ?? 'violet';
  const size = width ? `width:${width}px;height:${height}px;` : '';
  return `
    <div class="ja-tile ja-tile--${accent}" style="${size}">
      <div class="ja-tile__kicker">${escapeHtml(tile.kicker)}</div>
      <div class="ja-tile__value">${escapeHtml(tile.value)}</div>
    </div>`;
}

export function activityTiles(state, opts = {}) {
  const tiles = state.activity?.tiles ?? {};
  /* Missing tiles are skipped rather than drawn empty — a provider that has
     not reported a sub yet should not leave a blank box on screen. */
  return ['follower', 'sub', 'tip']
    .map((key) => tiles[key])
    .filter(Boolean)
    .map((tile) => infoTile(tile, opts))
    .join('');
}

/* ---------- Recent events list ---------- */

/** How long ago, in the shortest honest form. */
function agoLabel(then, now) {
  const secs = Math.max(0, Math.round((now - then) / 1000));
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h`;
}

/** One row of the recent-events list. */
export function eventRow(event, cfg, colors) {
  const meta = EVENT_META[event.type];
  if (!meta) return '';
  const el = cfg.elements ?? {};
  const detail = renderTemplate(EVENT_TEMPLATES[event.type] ?? '', event).trim();
  const compact = cfg.compact ? ' ja-event--compact' : '';
  return `
    <div class="ja-event${compact}" style="--event-accent:${colors.primary}">
      ${el.icon === false ? '' : `<span class="ja-event__icon">${escapeHtml(meta.icon)}</span>`}
      <span class="ja-event__name">${escapeHtml(event.name ?? '')}</span>
      ${el.label === false ? '' : `<span class="ja-event__verb">${escapeHtml(meta.label)}</span>`}
      ${detail ? `<span class="ja-event__detail">${escapeHtml(detail)}</span>` : ''}
      ${el.timestamp && event.at ? `<span class="ja-event__ago">${escapeHtml(agoLabel(event.at, cfg.now ?? Date.now()))}</span>` : ''}
    </div>`;
}

/**
 * The recent-events list.
 *
 * Newest first, matching chat. Types the streamer has switched off in
 * `categories` never reach the list, so turning off raids hides the raid
 * that already happened too — the list reflects the current setting rather
 * than a frozen history.
 */
export function eventList(state, opts = {}) {
  const cfg = state.activity ?? {};
  const cats = cfg.categories ?? {};
  const colors = widgetColors(state, state.widgets?.activity ?? {});
  const max = Math.max(1, Math.min(Number(cfg.maxEvents) || 3, 20));
  const rows = (cfg.events ?? [])
    .filter((e) => e && EVENT_META[e.type] && cats[e.type] !== false)
    .slice(0, max)
    .map((e) => eventRow(e, { ...cfg, now: opts.now }, eventColors(state, e)))
    .join('');
  /* An empty list draws nothing rather than an empty panel — a quiet stream
     should not put a box on screen with nothing in it. */
  return rows ? `<div class="ja-events">${rows}</div>` : '';
}

/** An event borrows the accent its own type is associated with. */
function eventColors(state, event) {
  const widget = state.widgets?.activity ?? {};
  const accent = EVENT_META[event.type]?.accent ?? 'primary';
  return widgetColors(state, { ...widget, accent });
}

/** Tiles or list, whichever the streamer chose. */
export function activityPanel(state, opts = {}) {
  if ((state.activity?.mode ?? 'tiles') === 'list') return eventList(state, opts);
  return `<div style="display:flex;gap:16px">${activityTiles(state, opts.tile)}</div>`;
}

/* ---------- GoalBar — rail / segmented / mug ---------- */
/**
 * A goal, built from its own configuration.
 *
 * Orientation, alignment, thickness, radius, colours and which parts show are
 * all state — the same component covers a horizontal rail, a vertical bar and
 * the coffee mug without different markup per scene.
 */
export function goalBar(goal, { state = null, showHead = true, label = null, valueText = null } = {}) {
  const pct = goalPercent(goal);
  const el = goal.elements ?? { label: true, current: true, target: true, percentage: true, glow: true, animate: true };
  const colors = state ? widgetColors(state, goal) : { primary: 'var(--violet)', secondary: 'var(--cyan)', text: 'var(--text-2)' };
  const vertical = goal.orientation === 'vertical';

  const vars = [
    `--goal-primary:${colors.primary}`,
    `--goal-secondary:${colors.secondary}`,
    `--goal-text:${colors.text}`,
    `--goal-thickness:${goal.thickness ?? 6}px`,
    `--goal-radius:${goal.radius ?? 3}px`,
  ].join(';');

  const readout = el.percentage ? `${Math.round(pct)}%` : '';
  const values = [
    el.current ? `${goal.prefix ?? ''}${goal.current}` : '',
    el.target ? `${goal.prefix ?? ''}${goal.target}` : '',
  ].filter(Boolean).join(' / ');

  const head = showHead && (el.label || values || readout) ? `
    <div class="ja-goal__head">
      <span class="ja-goal__label">${escapeHtml(el.label ? (label ?? goal.label) : '')}</span>
      <span class="ja-goal__value">${escapeHtml(valueText ?? [values, readout].filter(Boolean).join(' · '))}</span>
    </div>` : '';

  const classes = [
    'ja-goal',
    vertical ? 'ja-goal--vertical' : 'ja-goal--horizontal',
    el.glow === false ? 'ja-goal--noglow' : '',
    el.animate === false ? 'ja-goal--static' : '',
    el.frame ? 'ja-goal--framed' : '',
  ].filter(Boolean).join(' ');

  const fillStyle = vertical ? `height:${pct.toFixed(1)}%` : `width:${pct.toFixed(1)}%`;

  if (goal.mode === 'segmented') {
    const count = goal.segments ?? 10;
    const filled = Math.round(pct / 100 * count);
    const segments = Array.from({ length: count }, (_, i) =>
      `<span class="ja-goal__segment${i < filled ? ' is-filled' : ''}"></span>`).join('');
    return `<div class="${classes}" style="${vars}" data-goal>${head}<div class="ja-goal__segments">${segments}</div></div>`;
  }

  if (goal.mode === 'mug') {
    return `
      <div class="${classes}" style="${vars}" data-goal>${head}
        <div class="ja-goal__mug">
          <div class="ja-goal__mug-fill" style="height:${pct.toFixed(1)}%"></div>
          ${el.percentage ? `<div class="ja-goal__mug-pct">${Math.round(pct)}%</div>` : ''}
        </div>
      </div>`;
  }

  return `
    <div class="${classes}" style="${vars}" data-goal>${head}
      <div class="ja-goal__rail"><div class="ja-goal__fill" style="${fillStyle}"></div></div>
    </div>`;
}

/** The gameplay rail — whichever goal the operator has pointed it at. */
export function goalRail(state) {
  const key = state.goals?.railGoal ?? 'follower';
  const goal = state.goals?.items?.[key] ?? state.goals?.items?.follower;
  if (!goal) return '';
  const pct = goalPercent(goal);
  return goalBar(goal, {
    state,
    label: goal.label,
    valueText: `${goal.current} / ${goal.target} · ${Math.round(pct)}%`,
  });
}

/* ---------- Alert — 720 x 132, 4 variants ---------- */
const ALERT_DEFAULTS = {
  follower: { kicker: 'NEW FOLLOWER',  asset: 'alertFollow' },
  sub:      { kicker: 'SUBSCRIBER',    asset: 'alertSub'    },
  tip:      { kicker: 'COFFEE FUND',   asset: 'alertTip'    },
  bits:     { kicker: 'BITS',          asset: 'alertBits'   },
};

function alertIcon(kind, data) {  /* data = template event values */
  const asset = ALERT_DEFAULTS[kind].asset;
  if (kind === 'sub')  return `<div class="ja-alert__icon" data-asset="${asset}"><span>SUB</span></div>`;
  if (kind === 'bits') return `<div class="ja-alert__icon" data-asset="${asset}"><span>${escapeHtml(data.amount || '')}</span></div>`;
  if (kind === 'tip')  return `
    <div class="ja-alert__icon" data-asset="${asset}">
      <span>
        <span class="ja-steam" style="position:absolute;left:50%;top:14px;transform:translateX(-50%);height:26px">
          <span class="ja-steam__bar" style="width:4px;height:16px"></span>
          <span class="ja-steam__bar" style="width:4px;height:22px"></span>
          <span class="ja-steam__bar" style="width:4px;height:14px"></span>
        </span>
        <span style="position:absolute;left:50%;bottom:12px;transform:translateX(-50%);width:34px;height:24px;border-radius:3px 3px 10px 10px;background:rgba(240,168,85,.5)"></span>
      </span>
    </div>`;
  /* follower: the mascot eye pair, which blooms on entrance */
  return `
    <div class="ja-alert__icon ja-avatar is-blooming" data-asset="${asset}">
      <span class="ja-avatar__eye" style="left:19px;top:33px;width:11px;height:11px"></span>
      <span class="ja-avatar__eye" style="left:45px;top:33px;width:11px;height:11px"></span>
    </div>`;
}

/**
 * One alert card, built from its type's configuration.
 *
 * Everything visual comes from state: title and body are templates, colours
 * resolve through the theme unless the type overrides them, and each element
 * can be switched off. The provider supplies only the event values.
 */
export function alertCard(data, state = null) {
  const kind = ALERT_DEFAULTS[data.kind] ? data.kind : 'follower';
  const cfg = state?.alerts?.[kind] ?? {};
  const el = cfg.elements ?? { icon: true, label: true, name: true, amount: true, message: true, border: true, panel: true };
  const colors = state ? widgetColors(state, cfg) : { primary: 'var(--violet)', secondary: 'var(--cyan)', text: 'var(--text-1)' };

  /* Event values a template may reference. */
  const event = {
    name: data.name ?? '',
    amount: data.amount ?? '',
    message: data.message ?? '',
    tier: data.tier ?? '',
    count: data.count ?? '',
  };

  const title = el.label ? renderTemplate(cfg.title ?? ALERT_DEFAULTS[kind].kicker, event) : '';
  const body = el.name ? renderTemplate(cfg.template ?? '{name}', event) : '';
  const secondary = el.message ? renderTemplate(cfg.secondary ?? '', event) : '';

  const style = [
    `--alert-primary:${colors.primary}`,
    `--alert-secondary:${colors.secondary}`,
    `--alert-text:${colors.text}`,
  ].join(';');

  return `
    <div class="ja-alert ja-alert--${kind}${el.panel ? '' : ' ja-alert--bare'}${el.border ? '' : ' ja-alert--noborder'}"
         style="${style}" data-alert-id="${escapeHtml(data.id ?? '')}" data-alert-kind="${kind}">
      ${el.icon ? alertIcon(kind, event) : ''}
      <div>
        ${title ? `<div class="ja-alert__kicker fx-text">${escapeHtml(title)}</div>` : ''}
        ${body ? `<div class="ja-alert__name fx-text">${escapeHtml(body)}</div>` : ''}
        ${secondary ? `<div class="ja-alert__message">“${escapeHtml(secondary)}”</div>` : ''}
      </div>
    </div>`;
}

/* ---------- MascotSlot ---------- */
export function mascotSlot({ width = 520, height = 620, caption = 'mascot.png', note = null, steam = true, asset = 'mascot' } = {}) {
  return `
    <div class="ja-mascot" data-asset="${asset}" style="width:${width}px;height:${height}px">
      <div class="ja-mascot__eyes"><span class="ja-mascot__eye"></span><span class="ja-mascot__eye"></span></div>
      ${steam ? `<div class="ja-steam ja-mascot__steam"><span class="ja-steam__bar"></span><span class="ja-steam__bar"></span><span class="ja-steam__bar"></span></div>` : ''}
      <div class="ja-mascot__caption">${escapeHtml(caption)}<span>${escapeHtml(note ?? `${width} × ${height} · transparent PNG`)}</span></div>
    </div>`;
}

/* ---------- TerminalLine / Countdown / Stinger ---------- */
export function terminalLine(text, { size = 26 } = {}) {
  return `
    <div class="ja-terminal" style="font-size:${size}px">
      <span data-bind="terminal-text">${escapeHtml(text)}</span>
      <span class="ja-terminal__caret" style="height:${size}px;width:${Math.round(size * 0.46)}px"></span>
    </div>`;
}

export function countdown(seconds) {
  return `<div class="ja-countdown"><span data-bind="countdown">${formatClock(seconds)}</span></div>`;
}

export function stinger() {
  return `<div class="ja-stinger" data-bind="stinger"><div class="ja-stinger__wipe"></div><div class="ja-stinger__scan"></div></div>`;
}

/* ---------- Safe-area guides (setup aid, §01) ---------- */
export function safeArea() {
  return `
    <div style="position:absolute;inset:0;pointer-events:none">
      <div style="position:absolute;left:32px;top:120px;width:1456px;height:660px;border:2px dashed rgba(34,230,224,.55);background:rgba(34,230,224,.05)">
        <div style="position:absolute;left:16px;top:14px;font-family:var(--font-mono);font-size:22px;letter-spacing:.24em;color:var(--cyan)">SAFE GAMEPLAY AREA · 1456 × 660 @ 32,120</div>
      </div>
      <div style="position:absolute;right:32px;top:120px;width:360px;height:680px;border:2px dashed rgba(185,92,240,.7)"></div>
      <div style="position:absolute;left:32px;bottom:64px;width:400px;height:225px;border:2px dashed rgba(185,92,240,.7)"></div>
      <div style="position:absolute;left:472px;bottom:64px;width:798px;height:70px;border:2px dashed rgba(240,168,85,.7)"></div>
    </div>`;
}

/* ---------- Sample gameplay plate (positioning aid only) ---------- */
export function samplePlate() {
  return `
    <div style="position:absolute;inset:0;background:repeating-linear-gradient(135deg,#101018 0 26px,#0C0C13 26px 52px)">
      <div style="position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 40%,rgba(111,212,255,.07),transparent 60%)"></div>
      <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;font-family:var(--font-mono);color:rgba(234,234,242,.22)">
        <div style="font-size:30px;letter-spacing:.34em">SAMPLE GAMEPLAY PLATE</div>
        <div style="font-size:20px;letter-spacing:.2em;margin-top:12px">NOT PART OF THE OVERLAY · OBS GAME CAPTURE SITS HERE</div>
      </div>
    </div>`;
}
