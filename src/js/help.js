/* ============================================================
   help.js — what every control actually does.

   Keyed by state path, so the same entry serves a generated
   control and a hand-written one. Repeated groups collapse to a
   wildcard: alerts.follower.duration and alerts.tip.duration are
   both `alerts.*.duration`, because the answer is the same and
   six copies of it would drift.

   Written for someone who has not read the README. Each entry
   says what the control changes, and where that is worth knowing,
   what it does NOT change — a control whose effect is invisible on
   the scene you happen to be previewing is the single most common
   reason something looks broken.
   ============================================================ */

/** alerts.tip.duration -> alerts.*.duration ; goals.items.coffee.x -> goals.items.*.x */
export function normalisePath(path) {
  return String(path ?? '')
    .replace(/^alerts\.[a-zA-Z]+\./, 'alerts.*.')
    .replace(/^goals\.items\.[a-zA-Z]+\./, 'goals.items.*.')
    .replace(/^activity\.categories\..+$/, 'activity.categories.*');
}

const H = (title, body, note = '') => ({ title, body, note });

export const HELP = {
  /* ---------- session ---------- */
  'stream.topic': H('Today\'s topic',
    'The line under your name on the Starting Soon and Just Chatting cards. It updates as you type.'),
  'stream.game': H('Now playing',
    'Shown in the system strip along the top of the Gameplay scene. Purely a label — it does not detect your game.'),
  'stream.countdownSeconds': H('Countdown',
    'Minutes shown counting down on the Starting Soon card. Leave it blank for no countdown.',
    'Only visible on Starting Soon.'),
  'caffeine.percent': H('Caffeine level',
    'Drives the mug and the percentage in the system strip. A running joke that doubles as a rough stream-length indicator.'),
  'caffeine.cup': H('Cup', 'Which cup you are on. Shown as "cup 3 of 5".'),
  'caffeine.cups': H('Of', 'How many cups you plan to get through.'),
  'caffeine.autoDecay': H('Auto-decay',
    'Lets the level fall by itself as the stream runs, so you do not have to keep adjusting it.',
    'Only moves while a session is running.'),

  /* ---------- theme ---------- */
  'theme.colors.primary': H('Primary colour',
    'The main accent. Brand bar, most borders, the follower alert and the majority of glows take this colour.'),
  'theme.colors.secondary': H('Secondary colour',
    'The contrast accent — live dots, goal fills, and anything meant to read as "community" rather than "identity".'),
  'theme.colors.highlight': H('Highlight colour',
    'Reserved for money: tips, the coffee fund, and the donation alert.'),
  'theme.colors.background': H('Background tone',
    'The base colour of the full-screen cards.',
    'Gameplay and Just Chatting are transparent, so this will not change them.'),
  'theme.colors.text': H('Main text', 'Headline and value text across the whole package.'),
  'theme.colors.textDim': H('Secondary text', 'Labels, kickers and anything meant to sit behind the main text.'),
  'theme.intensity.glow': H('Glow intensity',
    'How much everything glows, from 0 (flat and clean) to 2 (heavy neon). It scales every accent glow at once and takes the accent\'s own colour.'),
  'theme.intensity.backgroundBrightness': H('Background brightness',
    'How dark the full-screen cards are.',
    'No effect on Gameplay or Just Chatting, which are transparent.'),
  'theme.intensity.panelOpacity': H('Panel opacity',
    'How solid the panels behind chat and the tiles are. Lower lets more of your game through.'),
  'theme.intensity.borderBrightness': H('Border brightness', 'How visible the hairline borders are.'),
  'theme.intensity.scanlines': H('Scanline intensity',
    'A faint CRT wash over the whole overlay. Separate from the per-alert Scanlines effect.'),
  'theme.intensity.motion': H('Motion speed', 'How fast the ambient animations run. Lower is calmer.'),
  'theme.motionLevel': H('Motion',
    'FULL is everything. REDUCED stills most animation but keeps the live dot. OFF stops all of it.',
    'Reach for this before Effect performance if animation is what bothers you.'),
  'theme.performance': H('Effect performance',
    'Caps how expensive an alert effect stack may be. LOW allows only cheap effects, BALANCED adds medium, HIGH allows everything.',
    'Glow always survives, whatever this is set to.'),

  /* ---------- alerts ---------- */
  'alerts.*.enabled': H('Enabled', 'Whether this type of alert appears at all.'),
  'alerts.*.title': H('Title text',
    'The small line above the name. Tokens like {amount} are filled in when the alert fires; a token you mistype stays visible rather than vanishing.'),
  'alerts.*.template': H('Main text', 'The large line. Usually just {name}.'),
  'alerts.*.secondary': H('Secondary line', 'Under the name — typically {message}. Leave blank to omit it.'),
  'alerts.*.duration': H('Duration', 'How long the alert stays on screen, in milliseconds. 5000 is five seconds.'),
  'alerts.*.scale': H('Scale',
    'Overall size. The range is capped so a scaled alert cannot be pushed off the canvas.'),
  'alerts.*.position': H('Position',
    'Which of nine anchor points the alert appears at. Placement is presets only, which is what keeps it inside the safe margins.'),
  'alerts.*.entrance': H('Entrance', 'How the alert arrives.'),
  'alerts.*.exit': H('Exit', 'How it leaves.'),
  'alerts.*.animationMs': H('Animation duration', 'How long the entrance and exit take.'),
  'alerts.*.useThemeColors': H('Use theme colours',
    'On, this alert follows your Theme. Off, it takes the colours you set here and stops following the theme.'),
  'alerts.*.colors.primary': H('Alert primary', 'Only used when Use theme colours is off.'),
  'alerts.*.colors.secondary': H('Alert secondary', 'Only used when Use theme colours is off.'),
  'alerts.*.colors.text': H('Alert text', 'Only used when Use theme colours is off.'),
  'alerts.*.elements.icon': H('Icon', 'The small symbol at the left of the alert.'),
  'alerts.*.elements.label': H('Label', 'The title line above the name.'),
  'alerts.*.elements.name': H('Name', 'The viewer\'s name.'),
  'alerts.*.elements.amount': H('Amount', 'The tip amount, bit count or tier.'),
  'alerts.*.elements.message': H('Message', 'The viewer\'s own message, when they left one.'),
  'alerts.*.elements.border': H('Border', 'The outline around the alert.'),
  'alerts.*.elements.panel': H('Panel', 'The filled background. Off gives floating text with no box.'),

  /* ---------- chat ---------- */
  'chat.enabled': H('Chat enabled', 'Whether the chat panel is drawn.',
    'Chat appears on Gameplay and Just Chatting only.'),
  'chat.mode': H('Ground',
    'What sits behind the messages. PANEL is one box, BUBBLE gives each message its own, TRANSPARENT is text straight over your game.'),
  'chat.position': H('Position', 'Which corner or edge the chat panel anchors to.',
    'Only visible on Gameplay and Just Chatting.'),
  'chat.scale': H('Scale', 'Overall size of the chat panel and its text.'),
  'chat.maxMessages': H('Max messages',
    'How many lines are kept on screen. Newest is at the top; the oldest fades out under the scrim.'),
  'chat.typography.family': H('Font', 'One of the three fonts bundled with the package.'),
  'chat.typography.size': H('Font size', 'Message text size, in overlay pixels.'),
  'chat.typography.weight': H('Font weight', 'How heavy the message text is.'),
  'chat.typography.lineHeight': H('Line height', 'Spacing between wrapped lines within one message.'),
  'chat.colors.useThemeColors': H('Use theme colours',
    'On, chat follows your Theme. Off, it uses the colours set here.'),
  'chat.colors.usernameMode': H('Username colour',
    'PER USER gives everyone their own colour — a real platform sends one, and the demo messages fake it. SINGLE uses one colour for everybody. THEME makes names match your accents.'),
  'chat.colors.usernameColor': H('Username colour', 'Used only when Username colour is set to SINGLE.'),
  'chat.elements.timestamps': H('Timestamps', 'A small clock time before each message.'),
  'chat.elements.badges': H('Badges', 'MOD, SUB and VIP markers beside a name, when the source supplies them.'),
  'chat.elements.rail': H('Rail', 'The vertical accent line down the side of the panel.'),
  'chat.animation.style': H('Message animation', 'How a new message arrives.'),

  /* ---------- goals ---------- */
  'goals.railGoal': H('Which goal',
    'Which of your goals the full-width rail along the bottom of Gameplay shows. The others still exist; this only picks the one on the rail.'),
  'goals.items.*.enabled': H('Enabled', 'Whether this goal is drawn at all.'),
  'goals.items.*.label': H('Label', 'The wording above the bar.'),
  'goals.items.*.current': H('Current', 'Where you are now. A connected source keeps this up to date for you.'),
  'goals.items.*.target': H('Target', 'What you are aiming at. Always yours to set, even with a source connected.'),
  'goals.items.*.orientation': H('Orientation', 'ACROSS is a horizontal bar; UPRIGHT stands it on end.'),
  'goals.items.*.alignment': H('Alignment', 'Which end the label and value sit at.'),
  'goals.items.*.type': H('Style',
    'RAIL is one continuous bar, SEGMENTED breaks it into blocks, MUG is the coffee cup.'),
  'goals.items.*.thickness': H('Thickness', 'How thick the bar is.'),
  'goals.items.*.radius': H('Corner radius', 'How rounded the bar ends are.'),
  'goals.items.*.scale': H('Scale', 'Overall size of this goal.'),
  'goals.items.*.prefix': H('Prefix', 'Put in front of the numbers — a currency symbol, usually.'),
  'goals.items.*.useThemeColors': H('Use theme colours',
    'On, this goal follows your Theme. Off, it uses the colours set here.'),
  'goals.items.*.elements.label': H('Label', 'The wording above the bar.'),
  'goals.items.*.elements.current': H('Current value', 'The number you are at.'),
  'goals.items.*.elements.target': H('Target value', 'The number you are aiming at.'),
  'goals.items.*.elements.percentage': H('Percentage', 'The percentage after the numbers.'),
  'goals.items.*.elements.icon': H('Icon', 'A small symbol beside the label.'),
  'goals.items.*.elements.glow': H('Glow', 'The glow on the filled part of the bar.'),
  'goals.items.*.elements.animate': H('Animate', 'Whether the fill slides when the number changes.'),

  /* ---------- widgets ---------- */
  'widgets.brandBar.enabled': H('Brand bar', 'Your avatar, name and online status, top-left of Gameplay.'),
  'widgets.brandBar.position': H('Position', 'Which anchor point the brand bar sits at.'),
  'widgets.brandBar.scale': H('Scale', 'Overall size of the brand bar.'),
  'widgets.systemStrip.enabled': H('System strip', 'Uptime, caffeine and node, along the top-right of Gameplay.'),
  'widgets.systemStrip.position': H('Position', 'Which anchor point the strip sits at.'),
  'widgets.goalRail.enabled': H('Goal rail', 'The full-width goal bar along the bottom of Gameplay.'),
  'widgets.goalRail.position': H('Position',
    'At BOTTOM CENTRE the rail spans the whole frame. Any other anchor turns it into a fixed-width block.'),
  'widgets.goalRail.scale': H('Scale',
    'Thickness and text size. At bottom centre the bar still spans the frame — it will not grow past the edges.'),
  'widgets.webcam.enabled': H('Webcam frame',
    'The frame, corner ticks and nameplate around your camera. Turning it off leaves the cutout, so your camera still shows.'),
  'widgets.activity.enabled': H('Activity', 'The three tiles, or the recent-events list, on Gameplay.'),
  'activity.enabled': H('Activity', 'The three tiles, or the recent-events list, on Gameplay.'),
  'activity.mode': H('Mode',
    'TILES shows three fixed boxes — latest follower, sub and tip. RECENT EVENTS replaces them with a running list of what just happened.'),
  'activity.maxEvents': H('Max events', 'How many rows the recent-events list shows.',
    'Only applies in RECENT EVENTS mode.'),
  'activity.position': H('Position', 'Which anchor point the tiles or list sit at.'),
  'activity.scale': H('Scale', 'Overall size of the tiles or list.'),
  'activity.compact': H('Compact rows', 'Halves the row padding in the recent-events list.',
    'Only applies in RECENT EVENTS mode.'),
  'activity.elements.icon': H('Icons', 'The symbol at the start of each event row.'),
  'activity.elements.label': H('Labels', 'The "followed" / "tipped" wording in each row.'),
  'activity.elements.timestamp': H('Timestamps', 'How long ago each event happened.'),
  'activity.categories.*': H('Which events count',
    'Turning a type off hides it from the list immediately, including events already on screen.',
    'Only applies in RECENT EVENTS mode.'),

    /* ---------- alert effects ----------
     Each effect has one switch and its own settings, so the per-effect entries
     collapse to a wildcard on the effect name. */
  'alerts.*.effects.glow.on': H('Glow / Bloom',
    'A soft halo in the alert\'s own colour. The one effect that runs whatever your performance and motion settings are, so the cheapest configuration still looks designed.'),
  'alerts.*.effects.glow.intensity': H('Glow intensity', 'How strong the halo is.'),
  'alerts.*.effects.glow.radius': H('Glow radius', 'How far the halo spreads.'),
  'alerts.*.effects.edgeTrace.on': H('Edge Trace', 'A light that travels around the alert\'s border.'),
  'alerts.*.effects.edgeTrace.speed': H('Trace speed', 'How fast the light travels.'),
  'alerts.*.effects.edgeTrace.brightness': H('Trace brightness', 'How bright the travelling light is.'),
  'alerts.*.effects.flicker.on': H('Flicker', 'An unsteady, failing-sign wobble in brightness.'),
  'alerts.*.effects.flicker.intensity': H('Flicker intensity', 'How far the brightness drops.'),
  'alerts.*.effects.flicker.frequency': H('Flicker frequency', 'How often it flickers.'),
  'alerts.*.effects.scanlines.on': H('Scanlines', 'Fine horizontal lines across the alert, like a CRT.'),
  'alerts.*.effects.scanlines.opacity': H('Scanline opacity', 'How dark the lines are.'),
  'alerts.*.effects.scanlines.spacing': H('Scanline spacing', 'How far apart the lines sit.'),
  'alerts.*.effects.scanlines.speed': H('Scanline drift', 'How fast the lines crawl. Zero holds them still.'),
  'alerts.*.effects.rgbSplit.on': H('RGB / Chromatic split',
    'Separates the colour channels for a mis-registered print look.', 'Needs BALANCED or HIGH performance.'),
  'alerts.*.effects.rgbSplit.offsetX': H('Split — horizontal', 'How far the channels separate sideways.'),
  'alerts.*.effects.rgbSplit.offsetY': H('Split — vertical', 'How far the channels separate vertically.'),
  'alerts.*.effects.rgbSplit.intensity': H('Split intensity', 'How visible the separated channels are.'),
  'alerts.*.effects.ghosting.on': H('Ghosting',
    'A trailing copy behind the alert, like slow phosphor.', 'Needs BALANCED or HIGH performance.'),
  'alerts.*.effects.ghosting.offset': H('Ghost offset', 'How far behind the trailing copy sits.'),
  'alerts.*.effects.ghosting.opacity': H('Ghost opacity', 'How visible the trailing copy is.'),
  'alerts.*.effects.ghosting.decay': H('Ghost decay', 'How long the trail takes to fade.'),
  'alerts.*.effects.vhsSlice.on': H('VHS Slice / Tear',
    'Horizontal bands that jump sideways, like a worn tape.', 'Needs BALANCED or HIGH performance.'),
  'alerts.*.effects.vhsSlice.intensity': H('Slice intensity', 'How pronounced the tearing is.'),
  'alerts.*.effects.vhsSlice.frequency': H('Slice frequency', 'How often a band jumps.'),
  'alerts.*.effects.vhsSlice.displacement': H('Slice displacement', 'How far a band jumps.'),
  'alerts.*.effects.crt.on': H('CRT Distortion',
    'A curved-glass look with a darkened edge.',
    'Needs HIGH performance. The curvature is a rounded mask and vignette rather than a true warp, which is what keeps it cheap.'),
  'alerts.*.effects.crt.intensity': H('CRT intensity', 'How strong the whole effect is.'),
  'alerts.*.effects.crt.curvature': H('CRT curvature', 'How rounded the glass looks.'),
  'alerts.*.effects.crt.flicker': H('CRT flicker', 'A slow brightness roll over the glass.'),
  'alerts.*.effects.noise.on': H('Noise / Static',
    'Film grain over the alert.', 'Needs HIGH performance.'),
  'alerts.*.effects.noise.intensity': H('Noise intensity', 'How heavy the grain is.'),
  'alerts.*.effects.noise.frequency': H('Noise frequency', 'How fast the grain churns.'),

  /* ---------- chat, remaining ---------- */
  'chat.typography.spacing': H('Message spacing', 'The gap between one message and the next.'),
  'chat.colors.text': H('Message text', 'The colour of the message body, not the username.'),
  'chat.colors.background': H('Panel background', 'The colour behind the messages.',
    'Has no effect when Ground is set to TRANSPARENT.'),
  'chat.colors.backgroundOpacity': H('Panel opacity', 'How solid that background is.'),
  'chat.colors.border': H('Border colour', 'The outline around the chat panel.'),
  'chat.colors.header': H('Header colour', 'The CHAT_FEED bar along the top of the panel.'),
  'chat.elements.header': H('Header', 'The CHAT_FEED bar along the top of the panel.'),
  'chat.elements.viewerCount': H('Viewer count', 'The count shown in the header.',
    'Only Just Chatting draws one; a connected source supplies the number.'),

  'chat.elements.rounded': H('Rounded corners', 'Softer corners on the panel or bubbles.'),
  'chat.animation.speed': H('Animation speed', 'How fast a new message animates in.'),
  'chat.animation.distance': H('Animation distance', 'How far a new message travels as it arrives.'),
  'goals.items.*.mode': H('Counting mode',
    'COUNT shows plain numbers. CURRENCY formats them as money and uses the prefix.'),
  'goals.items.*.segments': H('Segments', 'How many blocks the bar is divided into.',
    'Only applies when Style is SEGMENTED.'),
  'goals.items.*.colors.primary': H('Goal primary', 'Only used when Use theme colours is off.'),
  'goals.items.*.colors.secondary': H('Goal secondary', 'Only used when Use theme colours is off.'),
  'goals.items.*.colors.text': H('Goal text', 'Only used when Use theme colours is off.'),
  'goals.items.*.elements.frame': H('Frame', 'The outline around the whole goal.'),

  /* ---------- setup aids ---------- */
  'display.showSafeArea': H('Safe-area guides',
    'Draws the margins so you can line sources up. A setup aid — switch it off before going live.'),
  'display.showSampleGameplay': H('Sample gameplay plate',
    'A stand-in for your game capture so you can position things without launching a game. A setup aid — switch it off before going live.'),
  'display.showCameraPlaceholder': H('Camera placeholder',
    'Fills the camera cutout with stripes so you can see where it is. A setup aid — it would cover your camera on a live scene.'),
};

/** The entry for a control, or null. */
export function helpFor(path) {
  return HELP[normalisePath(path)] ?? HELP[path] ?? null;
}
