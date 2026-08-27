/* ============================================================
   resolve.js — where a widget's actual values come from.

   The inheritance rule, in one place:

     widget override  ->  global theme  ->  schema default

   A widget with `useThemeColors: true` inherits. Set it false and
   its own colours win, with any blank slot still falling back to
   the theme rather than to nothing.

   Effects resolve the same way and are additionally gated by the
   performance preset and the motion level, so a heavy stack
   configured on a fast machine degrades rather than stutters.
   ============================================================ */

import { EFFECTS, PERFORMANCE, POSITIONS, SAFE_MARGIN, SCALE_RANGE, defaults } from './schema.js';

const clamp = (n, min, max) => Math.min(max, Math.max(min, Number.isFinite(+n) ? +n : min));
const isHex = (v) => /^#[0-9a-f]{6}$/i.test(String(v ?? ''));

/* ---------- theme ---------- */

const FALLBACK = {
  primary: '#8B4DFF', secondary: '#22E6E0', highlight: '#F0A855',
  background: '#0A0A0F', text: '#EAEAF2', textDim: '#8E8FA6',
};

/** The six global colours, with anything malformed replaced. */
export function themeColors(state) {
  const c = state?.theme?.colors ?? {};
  return Object.fromEntries(Object.entries(FALLBACK).map(([k, fb]) => [k, isHex(c[k]) ? c[k] : fb]));
}

export const INTENSITY_LIMITS = {
  glow:                 { min: 0,   max: 2,   step: 0.05 },
  panelOpacity:         { min: 0.2, max: 1,   step: 0.02 },
  backgroundBrightness: { min: 0.6, max: 1.4, step: 0.02 },
  borderBrightness:     { min: 0.2, max: 2,   step: 0.05 },
  scanlines:            { min: 0,   max: 0.6, step: 0.02 },
  motion:               { min: 0,   max: 1.5, step: 0.05 },
};

export function themeIntensity(state) {
  const i = state?.theme?.intensity ?? {};
  return Object.fromEntries(Object.entries(INTENSITY_LIMITS)
    .map(([k, lim]) => [k, clamp(i[k] ?? lim.max, lim.min, lim.max)]));
}

export function motionLevel(state) {
  const level = state?.theme?.motionLevel;
  return ['off', 'reduced', 'full'].includes(level) ? level : 'full';
}

export function performanceMode(state) {
  const mode = state?.theme?.performance;
  return PERFORMANCE[mode] ? mode : 'balanced';
}

/* ---------- widget colours ---------- */

/**
 * Resolve a widget's three working colours.
 * `accent` names which theme colour this widget borrows when inheriting —
 * so a donation alert can sit on the highlight while a follower alert takes
 * the primary, without either one storing a literal colour.
 */
export function widgetColors(state, widget = {}) {
  const theme = themeColors(state);
  const named = {
    primary: theme.primary, secondary: theme.secondary,
    highlight: theme.highlight, magenta: '#E256C8',
  };
  const inherited = {
    primary: named[widget.accent] ?? theme.primary,
    secondary: theme.secondary,
    text: theme.text,
  };
  if (widget.useThemeColors !== false) return inherited;

  const own = widget.colors ?? {};
  return {
    primary:   isHex(own.primary) ? own.primary : inherited.primary,
    secondary: isHex(own.secondary) ? own.secondary : inherited.secondary,
    text:      isHex(own.text) ? own.text : inherited.text,
  };
}

/** True when this widget is currently overriding the theme. */
export function isOverriding(widget) {
  return widget?.useThemeColors === false;
}

/* ---------- effects ---------- */

/**
 * The effects that should actually run, after the performance preset and
 * motion level have had their say. Returns `{ key: settings }`.
 */
export function activeEffects(state, widget = {}) {
  const allow = PERFORMANCE[performanceMode(state)].allow;
  const motion = motionLevel(state);
  const out = {};
  for (const [key, settings] of Object.entries(widget.effects ?? {})) {
    const meta = EFFECTS[key];
    if (!meta || !settings?.on) continue;
    if (!allow.includes(meta.cost)) continue;         /* too expensive for this preset */
    if (motion === 'off' && meta.animated) continue;  /* the global gate still wins */
    if (motion === 'reduced' && meta.animated && meta.cost !== 'low') continue;
    out[key] = settings;
  }
  return out;
}

/** Effects switched on but suppressed right now, and why — for honest UI. */
export function suppressedEffects(state, widget = {}) {
  const allow = PERFORMANCE[performanceMode(state)].allow;
  const motion = motionLevel(state);
  const out = [];
  for (const [key, settings] of Object.entries(widget.effects ?? {})) {
    const meta = EFFECTS[key];
    if (!meta || !settings?.on) continue;
    if (!allow.includes(meta.cost)) out.push([key, `needs ${meta.cost === 'high' ? 'HIGH' : 'BALANCED'} performance`]);
    else if (motion === 'off' && meta.animated) out.push([key, 'motion is off']);
    else if (motion === 'reduced' && meta.animated && meta.cost !== 'low') out.push([key, 'motion is reduced']);
  }
  return out;
}

/* ---------- position & scale ---------- */

/**
 * CSS for a position preset inside the 1920x1080 stage.
 * Presets only — there is deliberately no freeform placement.
 */
export function positionStyle(position, { margin = SAFE_MARGIN, inset = {} } = {}) {
  const pos = POSITIONS.includes(position) ? position : 'top-center';
  const [row, col] = pos === 'center' ? ['middle', 'center'] : pos.split('-');
  const m = (side) => `${inset[side] ?? margin}px`;
  const parts = ['position:absolute'];
  const transform = [];

  if (row === 'top') parts.push(`top:${m('top')}`);
  else if (row === 'bottom') parts.push(`bottom:${m('bottom')}`);
  else { parts.push('top:50%'); transform.push('translateY(-50%)'); }

  if (col === 'left') parts.push(`left:${m('left')}`);
  else if (col === 'right') parts.push(`right:${m('right')}`);
  else { parts.push('left:50%'); transform.push('translateX(-50%)'); }

  if (transform.length) parts.push(`transform:${transform.join(' ')}`);
  return parts.join(';');
}

/**
 * Scale a widget from the corner nearest its anchor, so scaling up never
 * pushes it off the canvas.
 */
export function scaleStyle(scale, position, kind) {
  const range = SCALE_RANGE[kind] ?? { min: 0.5, max: 2 };
  const s = clamp(scale ?? 1, range.min, range.max);
  if (s === 1) return '';
  const pos = POSITIONS.includes(position) ? position : 'top-center';
  const [row, col] = pos === 'center' ? ['middle', 'center'] : pos.split('-');
  const originY = row === 'top' ? 'top' : row === 'bottom' ? 'bottom' : 'center';
  const originX = col === 'left' ? 'left' : col === 'right' ? 'right' : 'center';
  return `transform-origin:${originX} ${originY};--widget-scale:${s}`;
}

/** Combine position and scale, keeping the centring translate intact. */
export function placement(widget = {}, kind, opts = {}) {
  const position = widget.position ?? 'top-center';
  const base = positionStyle(position, opts);
  const range = SCALE_RANGE[kind] ?? { min: 0.5, max: 2 };
  const s = clamp(widget.scale ?? 1, range.min, range.max);
  if (s === 1) return base;

  const pos = POSITIONS.includes(position) ? position : 'top-center';
  const [row, col] = pos === 'center' ? ['middle', 'center'] : pos.split('-');
  const t = [];
  if (row === 'middle') t.push('translateY(-50%)');
  if (col === 'center') t.push('translateX(-50%)');
  t.push(`scale(${s})`);
  const originY = row === 'top' ? 'top' : row === 'bottom' ? 'bottom' : 'center';
  const originX = col === 'left' ? 'left' : col === 'right' ? 'right' : 'center';
  return `${base.replace(/;transform:[^;]*/, '')};transform:${t.join(' ')};transform-origin:${originX} ${originY}`;
}

/* ---------- templates ---------- */

/**
 * Fill {name} / {amount} / {message} / {tier} / {count}.
 * An unknown token is left exactly as written — a typo stays visible rather
 * than silently deleting part of the line.
 */
export function renderTemplate(template, event = {}) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (whole, key) => {
    const value = event[key];
    return value === undefined || value === null || value === '' ? (key in event ? '' : whole) : String(value);
  }).replace(/\s{2,}/g, ' ').trim();
}

/* ---------- reset ---------- */

/** A fresh copy of one branch of the defaults, for the reset controls. */
export function defaultsFor(config, path) {
  const root = defaults(config);
  return path.split('.').reduce((acc, key) => acc?.[key], root);
}
