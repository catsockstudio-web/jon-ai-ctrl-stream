/* ============================================================
   Nightwire — defaults.
   ------------------------------------------------------------
   This file holds the STARTING values only. Everything here can
   be changed live from the control page, and those changes are
   saved in the browser — so routine streaming never requires
   editing this file.

   Edit it when you want to change what a fresh install, or a
   "Reset to defaults", starts from.
   ============================================================ */

export const config = {
  /* Which data provider the SCENES use. This stays 'manual' even with Twitch
     connected: live sources run in the server and push through the same path
     the dashboard uses, so a scene never learns where a follower came from. */
  provider: 'manual',

  /* ---- live sources ----
     A client id is public by design — it identifies the application, not the
     user, and is safe to ship. There is deliberately no client SECRET here:
     both integrations use Device Code Flow precisely so that nothing
     confidential has to live inside a folder a customer holds.

     Register once at https://dev.twitch.tv/console/apps (type: Public,
     OAuth redirect http://localhost) and paste the Client ID below. Leave it
     blank and the Connect button explains what is missing rather than
     failing silently. Env vars JA_TWITCH_CLIENT_ID / JA_GOOGLE_CLIENT_ID
     override these, which is how the test suite points at a mock. */
  twitch: {
    /* Registered as "Nightwire by Cat Sock Studio" (Public client, Broadcaster
       Suite). Public by design: it identifies the application, not the user,
       and is meant to ship. There is deliberately no secret — Device Code Flow
       exists so nothing confidential has to live in a customer's folder. */
    clientId: 'es9he0c8lj2ldbfe3yrks8inizlfg6',
  },
  youtube: {
    /* Google Cloud console, OAuth client of type "TV and Limited Input". */
    clientId: '',
  },

  /* Demo copy. This is what a fresh install shows before anyone has typed
     anything, so it is Cat Sock Studio's own channel rather than lorem ipsum:
     a buyer sees a finished overlay on first run instead of placeholders, and
     every screenshot taken of it is marketing. All of it is replaced from the
     dashboard — nothing here is baked into the design. */
  channel: {
    wordmark:    'CATSOCKSTUDIOS',
    showName:    'NIGHT SHIFT',
    tagline:     'Cat Sock Studio',
    handle:      '@catsockstudio',
    twitch:      'TWITCH / CATSOCKSTUDIO',
    location:    'STREAMING FROM THE STUDIO',
    schedule:    'THU–SUN · 8PM CT',
    blurb:       'Games, builds, and whatever the cat walks across the keyboard next. Live from Cat Sock Studio.',
    node:        'CSS-01',
    commands:    ['!DISCORD', '!SETUP'],
    camLabel:    'CAM_01',
  },

  stream: {
    /* Epoch ms the session started, or null for "not started".
       Uptime is derived from this locally in every scene, so the clock
       stays correct with no per-second traffic on the bus. */
    startedAt: null,
    topic: 'Builds, bad decisions, and a cat with opinions',
    game:  'Helldivers 2',
    /* Seconds remaining on the Starting Soon countdown; null hides it. */
    countdownSeconds: null,
  },

  caffeine: {
    percent: 84,
    cup: 2,
    cups: 3,
    /* §01 note: "CAFFEINE % in the system strip decays over the session".
       With autoDecay on, the displayed % falls from `percent` at
       decayPerHour points/hour measured from stream start. Off by
       default so the number only ever moves when you move it. */
    autoDecay: false,
    decayPerHour: 12,
  },

  goals: {
    follower: { label: 'GOAL // 250 FOLLOWERS', short: 'FOLLOWER GOAL', current: 214, target: 250, mode: 'rail' },
    sub:      { label: 'SUB GOAL',              short: 'SUB GOAL',      current: 18,  target: 30,  mode: 'segmented', segments: 10 },
    coffee:   { label: 'COFFEE FUND',           short: 'COFFEE FUND',   current: 68,  target: 120, mode: 'mug', prefix: '$' },
  },

  /* The three gameplay activity tiles. */
  activity: {
    follower: { kicker: 'FOLLOWER',          value: 'mothwing',        accent: 'violet' },
    sub:      { kicker: 'SUB · 3 MO',        value: 'quietstatic',     accent: 'cyan'   },
    tip:      { kicker: 'TIP · COFFEE FUND', value: 'binaryowl · $5',    accent: 'amber' },
  },

  /* Per-module visibility. The control page toggles these live. */
  modules: {
    brandBar:      true,
    systemStrip:   true,
    chat:          true,
    webcam:        true,
    activityTiles: true,
    goalRail:      true,
    alerts:        true,
  },

  /* Safe, bounded customisation. These are the only visual knobs exposed to
     an operator: enough to match a brand, not enough to break the design. */
  theme: {
    /* Primary and secondary accent. Everything violet/purple derives from the
       first, everything cyan/blue from the second. Magenta and amber stay
       fixed because they carry meaning (bits, money). */
    accent:    '#8B4DFF',
    accentAlt: '#22E6E0',
    /* Glow strength, 0 = flat, 1 = as designed, 2 = heavy. */
    glow: 1,
    /* Background brightness, 1 = as designed. Below 1 is darker. */
    background: 1,
    /* 'full' as designed · 'reduced' keeps only the live dot · 'off' freezes
       everything (§08 reduced-motion rule). */
    motion: 'full',
  },

  /* Uploaded artwork. Empty means "use the CSS fallback"; the dashboard
     writes here when a file is dropped in, and the server owns the files. */
  branding: {
    logo: null, avatar: null, mascot: null, brbArt: null,
    startingBackground: null, brbBackground: null, endingBackground: null,
  },

  display: {
    /* Dashed overlay showing the safe gameplay area — setup aid, not for live. */
    showSafeArea: false,
    /* The striped "SAMPLE GAMEPLAY PLATE" from the design sheet. Defaults
       OFF here (unlike the mock, where it was on) because on a live
       overlay it would cover the actual game capture. Turn it on from the
       control page while positioning sources. */
    showSampleGameplay: false,
    /* 'panel' (82% ground) or 'transparent' (drop-shadowed type). §07. */
    chatGround: 'panel',
    /* The striped CAM_01 plate inside the webcam frame. OFF for live: OBS
       composites the camera BELOW the browser source, so anything painted in
       the frame's interior covers it. Turn it on from the control page while
       positioning a camera that is not running yet. */
    showCameraPlaceholder: false,
  },

  chat: {
    /* Messages kept on screen; the oldest fades under the scrim. */
    maxMessages: 7,
    /* Shown when no live chat provider is connected. With the manual
       provider this is the chat you see — it is sample content, and it
       is the only place in the package that ships fake usernames. */
    /* Timestamps and a badge are included so the Chat page's Timestamps and
       Badges switches visibly do something before a real chat is connected.
       A toggle with nothing to act on reads as a broken control. */
    demoMessages: [
      { author: 'sockpuppet_77', color: 'purple',  text: 'the cat is on the desk again', at: '20:41' },
      { author: 'mothwing',      color: 'cyan',    text: 'that clip was clean',            at: '20:42' },
      { author: 'quietstatic',   color: 'blue',    text: 'overlay looks unreal 🐈', emotes: 1, at: '20:43', badge: 'SUB' },
      { author: 'derelict_ave',  color: 'magenta', text: 'what keyboard is that',          at: '20:44' },
      { author: 'nine_lives',    color: 'amber',   text: 'welcome in, first-timers',       at: '20:45', badge: 'MOD' },
      { author: 'binaryowl',     color: 'purple',  text: 'chat looks sharp tonight' },
      { author: 'lowlightlena',  color: 'cyan',    text: 'here for the whole shift' },
    ],
  },

  alerts: {
    /* §07: 720 x 132, centre-top, 5 s life. */
    durationMs: 5000,
    /* Queue depth; extra alerts wait rather than stacking on screen. */
    maxQueue: 12,
  },

  /* Optional user assets. Every one of these is optional — each slot has
     a CSS/SVG fallback from the design and the package ships complete
     without a single image. Drop a real file at the path and it takes
     over automatically; no scene code changes. See assets/README.md. */
  assets: {
    logo:              'assets/logo.png',
    avatar:            'assets/avatar.png',
    mascot:            'assets/mascot.png',
    brbArt:            'assets/brb-art.png',
    startingBackground:'assets/starting-background.jpg',
    brbBackground:     'assets/brb-background.jpg',
    endingBackground:  'assets/ending-background.jpg',
    alertFollow:       'assets/alert-follow.png',
    alertSub:          'assets/alert-sub.png',
    alertTip:          'assets/alert-tip.png',
    alertBits:         'assets/alert-bits.png',
  },
};

export default config;
