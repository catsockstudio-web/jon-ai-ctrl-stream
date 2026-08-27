/* ============================================================
   components.js — the §09 COMPONENT INVENTORY as markup.

   Pure functions: state in, HTML string out. No provider access, no
   DOM queries, no side effects. Both the full scenes and the
   standalone module pages render from these, so a module positioned
   separately in OBS is pixel-identical to its place in a scene.
   ============================================================ */

import { escapeHtml, goalPercent, goalReadout, formatClock } from './format.js';

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
export function chatMessage(msg) {
  const colour = CHAT_COLOURS[msg.color] ?? 'var(--purple)';
  const emotes = Array.from({ length: msg.emotes ?? 0 }, () => `<span class="ja-chat__emote"></span>`).join('');
  return `
    <div class="ja-chat__msg${msg.highlight ? ' ja-chat__msg--highlight' : ''}"${msg.fading ? ' style="opacity:.55"' : ''}>
      <span class="ja-chat__author" style="color:${colour}">${escapeHtml(msg.author)}</span>
      <span> ${escapeHtml(msg.text)}</span>${emotes}
    </div>`;
}

/* Chat reads newest-first, top-anchored: the design's last message is the
   faded one, sitting under the 120px bottom scrim (§07 "oldest fades under
   a 120 px bottom scrim"). So `chat.messages` is in display order — index 0
   is the newest — and a live provider prepends rather than appends. */
export function chatBox(state, { width = 360, height = 680, meta = 'LIVE' } = {}) {
  const transparent = state.display.chatGround === 'transparent';
  const limit = state.chat.maxMessages ?? 7;
  const messages = (state.chat.messages ?? []).slice(0, limit);
  return `
    <div class="ja-chat${transparent ? ' ja-chat--transparent' : ''}" style="width:${width}px;height:${height}px">
      <div class="ja-panel-header">
        <span class="ja-panel-header__label">CHAT_FEED</span>
        <span class="ja-panel-header__meta">${escapeHtml(meta)}</span>
        <span class="ja-panel-header__trace"></span>
      </div>
      <div class="ja-chat__list" data-bind="chat-list">${messages.map((msg, i) =>
        chatMessage(i === messages.length - 1 && messages.length >= limit ? { ...msg, fading: true } : msg)).join('')}</div>
      <div class="ja-chat__rail"></div>
      <div class="ja-chat__scrim"></div>
    </div>`;
}

/* ---------- camera openings ----------
   One source of truth for where a camera shows through. A scene uses the same
   record to position its frame AND to punch its ground, so the hole and the
   border can never drift apart. Values are the §09 measurements. */
export const CAMERA_OPENINGS = {
  gameplay:     { x: 32, y: 791, width: 400,  height: 225 },
  justChatting: { x: 56, y: 300, width: 1160, height: 652 },
};

/* Frame corner radii, matching `border-radius: 2px 20px 2px 20px`
   (top-left, top-right, bottom-right, bottom-left). */
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
 *
 * The opening is traced with the frame's own corner radii, so no camera
 * bleeds past the rounded border at the corners.
 */
export function groundCutout(opening, { stageWidth = 1920, stageHeight = 1080 } = {}) {
  const { x, y, width: w, height: h } = opening;
  const { tl, tr, br, bl } = FRAME_RADII;
  const ring = [];

  /* Counter-clockwise in screen coordinates: down the left edge, across the
     bottom, up the right edge, back along the top. */
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
 * Wrap a scene's opaque background layers.
 *
 * Anything painting a solid backdrop belongs in here rather than on the body,
 * so `opening` can cut one genuine hole through all of it at once.
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
  const accent = tile.accent ?? 'violet';
  const size = width ? `width:${width}px;height:${height}px;` : '';
  return `
    <div class="ja-tile ja-tile--${accent}" style="${size}">
      <div class="ja-tile__kicker">${escapeHtml(tile.kicker)}</div>
      <div class="ja-tile__value">${escapeHtml(tile.value)}</div>
    </div>`;
}

export function activityTiles(state, opts = {}) {
  const { follower, sub, tip } = state.activity;
  return [follower, sub, tip].map((tile) => infoTile(tile, opts)).join('');
}

/* ---------- GoalBar — rail / segmented / mug ---------- */
export function goalBar(goal, { showHead = true, label = null, valueText = null } = {}) {
  const pct = goalPercent(goal);
  const head = showHead ? `
    <div class="ja-goal__head">
      <span class="ja-goal__label">${escapeHtml(label ?? goal.short ?? goal.label)}</span>
      <span class="ja-goal__value">${escapeHtml(valueText ?? goalReadout(goal))}</span>
    </div>` : '';

  if (goal.mode === 'segmented') {
    const count = goal.segments ?? 10;
    const filled = Math.round(pct / 100 * count);
    const segments = Array.from({ length: count }, (_, i) =>
      `<span class="ja-goal__segment${i < filled ? ' is-filled' : ''}"></span>`).join('');
    return `<div class="ja-goal" data-goal>${head}<div class="ja-goal__segments">${segments}</div></div>`;
  }

  if (goal.mode === 'mug') {
    return `
      <div class="ja-goal" data-goal>${head}
        <div class="ja-goal__mug">
          <div class="ja-goal__mug-fill" style="height:${pct.toFixed(1)}%"></div>
          <div class="ja-goal__mug-pct">${Math.round(pct)}%</div>
        </div>
      </div>`;
  }

  return `
    <div class="ja-goal" data-goal>${head}
      <div class="ja-goal__rail"><div class="ja-goal__fill" style="width:${pct.toFixed(1)}%"></div></div>
    </div>`;
}

/** The gameplay goal rail — 1856 x 6 @ 32,1048, with its own head format. */
export function goalRail(state) {
  const goal = state.goals.follower;
  const pct = goalPercent(goal);
  return goalBar(goal, {
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

function alertIcon(kind, data) {
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

export function alertCard(data) {
  const kind = ALERT_DEFAULTS[data.kind] ? data.kind : 'follower';
  const defaults = ALERT_DEFAULTS[kind];
  let kicker = data.kicker;
  if (!kicker) {
    if (kind === 'tip')      kicker = `${defaults.kicker} · ${data.amount || ''}`.trim();
    else if (kind === 'sub') kicker = data.amount ? `${defaults.kicker} · ${data.amount}` : defaults.kicker;
    else                     kicker = defaults.kicker;
  }
  return `
    <div class="ja-alert ja-alert--${kind} is-entering" data-alert-id="${escapeHtml(data.id ?? '')}">
      ${alertIcon(kind, data)}
      <div>
        <div class="ja-alert__kicker">${escapeHtml(kicker)}</div>
        <div class="ja-alert__name">${escapeHtml(data.name)}</div>
        ${data.message ? `<div class="ja-alert__message">“${escapeHtml(data.message)}”</div>` : ''}
      </div>
      <span class="ja-alert__trace"></span>
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
