#!/usr/bin/env node
/* ============================================================
   integrations.mjs — live sources reach the overlay.

   Twitch cannot be tested against Twitch, so test/mock-twitch.mjs
   reproduces the protocol and this suite drives the real
   integration code against it: device flow, token exchange,
   subscription creation, every event mapping, reconnection, and
   the rule that a live source owns its own numbers.

   The relay is tested against the real server, because it has no
   third party to stand in for.

   Usage:  node test/integrations.mjs      (starts its own server)
   ============================================================ */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rm, readFile } from 'node:fs/promises';
import { startMockTwitch } from './mock-twitch.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8795;
const BASE = `http://127.0.0.1:${PORT}`;
const STATE_FILE = join(ROOT, 'state.integrations.json');
const CREDS_FILE = STATE_FILE.replace(/\.json$/, '') + '.credentials.json';

const results = [];
const check = (name, pass, detail = '') => {
  results.push([name, pass]);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const mock = await startMockTwitch();

let server;
const startServer = () => {
  server = spawn(process.execPath, [join(ROOT, 'server.mjs'), String(PORT), '--state', STATE_FILE], {
    cwd: ROOT, stdio: 'ignore',
    env: {
      ...process.env,
      /* Point the integration at the mock instead of Twitch. */
      JA_TWITCH_ID_BASE: mock.idBase,
      JA_TWITCH_API_BASE: mock.apiBase,
      JA_TWITCH_WS_URL: mock.wsUrl,
      JA_TWITCH_CLIENT_ID: 'test-client-id',
    },
  });
};
const stopServer = async () => {
  server?.kill('SIGKILL');
  server = null;
  for (let i = 0; i < 40; i += 1) {
    try { await fetch(`${BASE}/api/state`, { signal: AbortSignal.timeout(300) }); await sleep(100); }
    catch { return; }
  }
  throw new Error(`port ${PORT} did not free up`);
};
const waitForServer = async (ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if ((await fetch(`${BASE}/api/state`)).ok) return; } catch { /* not yet */ }
    await sleep(150);
  }
  throw new Error('server did not start');
};

const getState = async () => (await fetch(`${BASE}/api/state`)).json();
const integrations = async () => (await fetch(`${BASE}/api/integrations`)).json();
const source = async (id) => (await integrations()).sources.find((s) => s.id === id);
const post = (path, body) => fetch(BASE + path, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
/** Wait for a condition, so tests do not depend on a fixed sleep. */
async function until(fn, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await sleep(120);
  }
  return null;
}

await rm(STATE_FILE, { force: true });
await rm(CREDS_FILE, { force: true });
startServer();
await waitForServer();

/* ============================================================
   1. The relay — anything that can POST can drive the overlay
   ============================================================ */
{
  await post('/api/integrations/relay/connect');
  const relay = await source('relay');
  check('relay connects with no account', relay.state === 'linked', relay.detail);
  check('relay publishes an address to point tools at', /^\/api\/ingest\/[0-9a-f]{32}$/.test(relay.endpoint), relay.endpoint);

  const key = relay.endpoint;
  const ok = await post(key, { kind: 'tip', name: 'dallas_dev', amount: '$5.00', message: 'next round' });
  check('relay accepts a well-formed event', ok.status === 200);

  const listed = await until(async () => (await getState()).activity.events.find((e) => e.name === 'dallas_dev'));
  check('a relayed alert reaches overlay state', Boolean(listed) && listed.type === 'tip', listed?.type);

  await post(key, { kind: 'chat', user: 'sam', text: 'welcome in', colour: '#22E6E0', badges: ['moderator'] });
  const line = await until(async () => (await getState()).chat.messages.find((m) => m.author === 'sam'));
  check('a relayed chat line reaches overlay state', Boolean(line), line?.text);
  check('chat uses the shape the component renders',
    line && 'author' in line && 'text' in line && 'color' in line, JSON.stringify(line));
  check('a platform hex colour survives', line?.color === '#22E6E0', line?.color);
  check('badges collapse to the one that matters', line?.badge === 'MOD', line?.badge);

  const badKey = await post('/api/ingest/deadbeef', { kind: 'tip', name: 'x' });
  check('relay refuses a wrong key', badKey.status === 400);
  const badKind = await post(key, { kind: 'nonsense' });
  const why = await badKind.json();
  check('relay says why it refused a bad kind', badKind.status === 400 && /must be one of/.test(why.error), why.error);

  const before = (await source('relay')).endpoint;
  await post('/api/integrations/relay/rotate');
  const after = (await source('relay')).endpoint;
  check('rotating the address invalidates the old one', before !== after);
  const stale = await post(before, { kind: 'tip', name: 'should-not-arrive' });
  check('the old address stops working', stale.status === 400);
}

/* ============================================================
   2. Twitch — device flow against the mock
   ============================================================ */
{
  const started = await (await post('/api/integrations/twitch/connect')).json();
  check('connect returns a device code to type', started.kind === 'device' && started.userCode === 'ABCD-1234', started.userCode);
  check('connect returns the page to type it on', /twitch\.tv\/activate/.test(started.verifyUrl ?? ''), started.verifyUrl);
  check('the source reports itself as waiting', (await source('twitch')).state === 'pending');

  /* The streamer approves on twitch.tv/activate. */
  mock.approve();
  const linked = await until(async () => (await source('twitch')).state === 'linked');
  check('approving the code links the account', Boolean(linked));

  const twitch = await source('twitch');
  check('the linked account is named', twitch.account === 'CatSockStudio', twitch.account);
  check('every event type is subscribed', mock.state.subscriptions.length === 9, `${mock.state.subscriptions.length} subscriptions`);
  check('chat is subscribed over the same socket',
    mock.state.subscriptions.includes('channel.chat.message'));
}

/* ============================================================
   3. Twitch events become alerts, chat and state
   ============================================================ */
{
  const seen = async (name) => until(async () => (await getState()).activity.events.find((e) => e.name === name));

  mock.send('channel.follow', { user_name: 'kayla_tx' });
  const follow = await seen('kayla_tx');
  check('a follow becomes a follower alert', follow?.type === 'follower', follow?.type);

  mock.send('channel.cheer', { user_name: 'tinygoose', bits: 500, message: 'nice run' });
  const cheer = await seen('tinygoose');
  check('a cheer becomes a bits alert with the amount', cheer?.type === 'bits' && cheer.amount === '500', `${cheer?.type} ${cheer?.amount}`);

  mock.send('channel.raid', { from_broadcaster_user_name: 'brewbot_9', viewers: 42 });
  const raid = await seen('brewbot_9');
  check('a raid carries the viewer count', raid?.type === 'raid' && raid.count === '42', raid?.count);

  mock.send('channel.subscription.gift', { user_name: 'ctrl_alt_jen', tier: '1000', total: 5 });
  const gift = await seen('ctrl_alt_jen');
  check('a gift sub carries how many', gift?.type === 'giftSub' && gift.count === '5', gift?.count);

  mock.send('channel.subscription.message', { user_name: 'n0de_runner', tier: '2000', cumulative_months: 3, message: { text: 'third month' } });
  const resub = await seen('n0de_runner');
  check('a resub carries its tier', resub?.type === 'sub' && resub.tier === 'TIER 2', resub?.tier);

  /* A gifted sub also raises channel.subscribe for the recipient. Drawing
     both would show one gift as two alerts. */
  const countBefore = (await getState()).activity.events.length;
  mock.send('channel.subscribe', { user_name: 'gift_recipient', tier: '1000', is_gift: true });
  await sleep(600);
  const countAfter = (await getState()).activity.events.length;
  check('a gifted sub does not double-alert', countAfter === countBefore, `${countBefore} -> ${countAfter}`);

  mock.send('channel.chat.message', {
    chatter_user_name: 'kayla_tx', color: '#FF3366',
    message: { text: 'that route was clean' }, badges: [{ set_id: 'subscriber' }],
  });
  const line = await until(async () => (await getState()).chat.messages.find((m) => m.author === 'kayla_tx'));
  check('a chat message reaches the overlay', line?.text === 'that route was clean', line?.text);
  check('the chatter keeps their own colour', line?.color === '#FF3366', line?.color);
  check('a subscriber badge is shown', line?.badge === 'SUB', line?.badge);
}

/* ============================================================
   4. Live status and ownership
   ============================================================ */
{
  const at = Date.now() - 60_000;
  mock.send('stream.online', { started_at: new Date(at).toISOString() });
  const online = await until(async () => (await getState()).stream.startedAt);
  check('going live on Twitch starts the uptime clock', Math.abs(online - at) < 2000, String(online));

  const owned = (await integrations()).owned;
  check('a linked source declares what it owns', owned.includes('stream.startedAt'), owned.join(', '));
  check('follower count is owned once Twitch is linked', owned.includes('goals.items.follower.current'));

  /* A follow should move the goal, since Twitch is now the truth for it. */
  const before = (await getState()).goals.items.follower.current;
  mock.send('channel.follow', { user_name: 'second_follower' });
  const moved = await until(async () => {
    const now = (await getState()).goals.items.follower.current;
    return now === before + 1 ? now : null;
  });
  check('a follow moves the follower goal', Boolean(moved), `${before} -> ${moved}`);

  mock.send('stream.offline', {});
  const offline = await until(async () => ((await getState()).stream.startedAt === null ? 'off' : null));
  check('going offline stops the clock', offline === 'off');
}

/* ============================================================
   5. It survives a dropped socket and a restart
   ============================================================ */
{
  mock.dropSockets();
  const back = await until(async () => (await source('twitch')).state === 'linked', 12000);
  check('a dropped Twitch socket reconnects on its own', Boolean(back));

  mock.send('channel.follow', { user_name: 'after_reconnect' });
  const arrived = await until(async () => (await getState()).activity.events.find((e) => e.name === 'after_reconnect'));
  check('events flow again after reconnecting', Boolean(arrived));

  await stopServer();
  startServer();
  await waitForServer();
  const resumed = await until(async () => (await source('twitch')).state === 'linked', 12000);
  check('a linked account survives a server restart', Boolean(resumed));
}

/* ============================================================
   6. Credentials are kept out of everything they should be
   ============================================================ */
{
  const state = await getState();
  const asText = JSON.stringify(state);
  check('no token appears in overlay state', !/token-\d|refreshed-\d|R1|R2/.test(asText));
  check('no credentials key exists in overlay state', !('credentials' in state));

  const onDisk = JSON.parse(await readFile(STATE_FILE, 'utf8'));
  check('no token is written to state.json', !/token-\d|refreshed-\d/.test(JSON.stringify(onDisk)));

  const creds = JSON.parse(await readFile(CREDS_FILE, 'utf8'));
  check('tokens live in their own file', Boolean(creds.twitch?.accessToken), Object.keys(creds).join(', '));

  const status = await integrations();
  check('the status endpoint never exposes a token', !/token-\d|refreshed-\d/.test(JSON.stringify(status)));

  /* A settings reset must not sign you out. */
  await post('/api/reset');
  await sleep(400);
  const stillLinked = await until(async () => (await source('twitch')).state === 'linked', 8000);
  check('"Reset everything" does not sign you out', Boolean(stillLinked));

  /* Disconnect must actually forget. */
  await post('/api/integrations/twitch/disconnect');
  const gone = await until(async () => (await source('twitch')).state === 'off');
  check('disconnect reports the source as off', Boolean(gone));
  const after = JSON.parse(await readFile(CREDS_FILE, 'utf8'));
  check('disconnect deletes the stored token', !after.twitch, JSON.stringify(Object.keys(after)));
  const ownedNow = (await integrations()).owned;
  check('nothing is owned once disconnected', ownedNow.length === 0, ownedNow.join(', '));
}

await stopServer();
await mock.close();
await rm(STATE_FILE, { force: true });
await rm(CREDS_FILE, { force: true });

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
