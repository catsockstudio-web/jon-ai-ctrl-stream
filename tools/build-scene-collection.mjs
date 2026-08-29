#!/usr/bin/env node
/* ============================================================
   build-scene-collection.mjs

   Generates an OBS scene collection with every source pre-wired:
   browser sources at the right URLs and sizes, cameras sized and
   positioned to the authored openings, and the rounded-corner mask
   filter already attached.

   The point is that the client never types a URL or a coordinate.

   Mask paths cannot be known at build time, so they are written as
   the token __PACKAGE_DIR__ and substituted by Setup.bat once the
   package's real location is known.
   ============================================================ */

import { writeFileSync } from 'node:fs';
import { CAMERA_OPENINGS } from '../src/js/components.js';

const BASE = 'http://127.0.0.1:8787';
const PREV_VER = 520093698;           /* OBS 30+ writes this; older builds still read it */

/* Deterministic UUIDs so rebuilding the collection does not churn the file. */
let seed = 0x9e3779b9;
function uuid() {
  const hex = [];
  for (let i = 0; i < 16; i += 1) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
    hex.push((seed & 0xff).toString(16).padStart(2, '0'));
  }
  const s = hex.join('');
  return `${s.slice(0,8)}-${s.slice(8,12)}-4${s.slice(13,16)}-a${s.slice(17,20)}-${s.slice(20,32)}`;
}

/* Fields OBS expects on every source. Omitting them makes OBS fall back to
   defaults that are usually right, but being explicit avoids surprises. */
const common = () => ({
  prev_ver: PREV_VER,
  mixers: 0, sync: 0, flags: 0,
  volume: 1.0, balance: 0.5,
  enabled: true, muted: false,
  'push-to-mute': false, 'push-to-mute-delay': 0,
  'push-to-talk': false, 'push-to-talk-delay': 0,
  hotkeys: {},
  deinterlace_mode: 0, deinterlace_field_order: 0,
  monitoring_type: 0,
  private_settings: {},
});

function browserSource(name, path) {
  return {
    ...common(),
    name, uuid: uuid(),
    id: 'browser_source', versioned_id: 'browser_source',
    settings: {
      url: `${BASE}${path}`,
      width: 1920, height: 1080,
      /* Keep state across scene switches rather than reloading each time. */
      shutdown: false,
      restart_when_active: false,
    },
    filters: [],
  };
}

function cameraSource(name, mask) {
  return {
    ...common(),
    name, uuid: uuid(),
    id: 'dshow_input', versioned_id: 'dshow_input',
    /* Left unconfigured on purpose: the client picks their own camera from
       the Device dropdown. Everything around it is already correct. */
    settings: { active: true },
    filters: mask ? [{
      ...common(),
      name: 'Rounded corners',
      id: 'mask_filter_v2', versioned_id: 'mask_filter_v2',
      settings: { type: 'mask_alpha_filter.effect', image_path: `__PACKAGE_DIR__\\obs\\${mask}` },
    }] : [],
  };
}

function gameCapture(name) {
  return {
    ...common(),
    name, uuid: uuid(),
    id: 'game_capture', versioned_id: 'game_capture',
    settings: { capture_mode: 'any_fullscreen' },
    filters: [],
  };
}

/* A scene item positions a source inside a scene. */
function item(source, id, { x = 0, y = 0, w = null, h = null } = {}) {
  const it = {
    name: source.name,
    source_uuid: source.uuid,
    visible: true, locked: false,
    rot: 0.0,
    pos: { x, y },
    scale: { x: 1.0, y: 1.0 },
    align: 5,                       /* top-left */
    bounds_type: 0, bounds_align: 0, bounds: { x: 0.0, y: 0.0 },
    crop_left: 0, crop_top: 0, crop_right: 0, crop_bottom: 0,
    id,
    group_item_backup: false,
    scale_filter: 'disable',
    blend_method: 'default', blend_type: 'normal',
    show_transition: { duration: 0 }, hide_transition: { duration: 0 },
    private_settings: {},
  };
  if (w && h) {
    /* Bounding box: forces the source to exactly this size whatever its
       native resolution, which is what makes a camera land on the opening. */
    it.bounds_type = 2;             /* SCALE_INNER */
    it.bounds_align = 0;
    it.bounds = { x: w, y: h };
  }
  return it;
}

function scene(name, items) {
  return {
    ...common(),
    name, uuid: uuid(),
    id: 'scene', versioned_id: 'scene',
    settings: { id_counter: items.length + 1, custom_size: false, items },
    filters: [],
  };
}

/* ---------- sources ---------- */
const gp = CAMERA_OPENINGS.gameplay;
const jc = CAMERA_OPENINGS.justChatting;

const srcStarting  = browserSource('Overlay — Starting Soon', '/scenes/starting-soon.html');
const srcGameplay  = browserSource('Overlay — Gameplay',      '/scenes/gameplay.html');
const srcChatting  = browserSource('Overlay — Just Chatting', '/scenes/just-chatting.html');
const srcBrb       = browserSource('Overlay — BRB',           '/scenes/brb.html');
const srcEnding    = browserSource('Overlay — Ending',        '/scenes/ending.html');
const srcOffline   = browserSource('Overlay — Offline',       '/scenes/offline.html');

const camGameplay  = cameraSource('Camera — Gameplay',      'camera-mask-gameplay.png');
const camChatting  = cameraSource('Camera — Just Chatting', 'camera-mask-just-chatting.png');
const game         = gameCapture('Game Capture');

/* Scene items are listed TOP-FIRST in OBS. Overlay above, camera below,
   game capture at the bottom — which is what makes the cutouts work. */
const scStarting = scene('JON · 1 Starting Soon', [item(srcStarting, 1)]);
const scGameplay = scene('JON · 2 Gameplay', [
  item(srcGameplay, 1),
  item(camGameplay, 2, { x: gp.x, y: gp.y, w: gp.width, h: gp.height }),
  item(game, 3),
]);
const scChatting = scene('JON · 3 Just Chatting', [
  item(srcChatting, 1),
  item(camChatting, 2, { x: jc.x, y: jc.y, w: jc.width, h: jc.height }),
]);
const scBrb     = scene('JON · 4 BRB',     [item(srcBrb, 1)]);
const scEnding  = scene('JON · 5 Ending',  [item(srcEnding, 1)]);
const scOffline = scene('JON · 6 Offline', [item(srcOffline, 1)]);

const scenes = [scStarting, scGameplay, scChatting, scBrb, scEnding, scOffline];

const collection = {
  current_scene: scStarting.name,
  current_program_scene: scStarting.name,
  scene_order: scenes.map((s) => ({ name: s.name })),
  name: 'Nightwire',
  sources: [
    srcStarting, srcGameplay, srcChatting, srcBrb, srcEnding, srcOffline,
    camGameplay, camChatting, game,
    ...scenes,
  ],
  groups: [],
  quick_transitions: [
    { name: 'Fade', duration: 300, hotkeys: {}, fade_to_black: false, id: 1 },
  ],
  transitions: [],
  current_transition: 'Fade',
  transition_duration: 300,
  preview_locked: false,
  scaling_enabled: false,
  scaling_level: 0,
  scaling_off_x: 0.0, scaling_off_y: 0.0,
  resolution: { x: 1920, y: 1080 },
};

const out = process.argv[2] ?? 'obs/Nightwire.json';
writeFileSync(out, JSON.stringify(collection, null, 4));
console.log(`wrote ${out}`);
console.log(`  scenes:  ${scenes.length}`);
console.log(`  sources: ${collection.sources.length - scenes.length} (+ ${scenes.length} scene objects)`);
console.log(`  camera:  gameplay ${gp.width}x${gp.height} @ ${gp.x},${gp.y}  |  just-chatting ${jc.width}x${jc.height} @ ${jc.x},${jc.y}`);
