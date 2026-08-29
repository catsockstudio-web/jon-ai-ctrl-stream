/* ============================================================
   mock-twitch.mjs — a stand-in for Twitch's id, Helix and
   EventSub WebSocket endpoints.

   The Twitch integration cannot be tested against Twitch: it needs
   a real account, a real broadcast, and a real follower to press
   the button. So the protocol is reproduced here instead — device
   flow, token exchange, subscription creation, and the WebSocket
   frames EventSub actually sends.

   This is the difference between "the code looks right" and "the
   code turns a channel.cheer frame into a bits alert on screen".
   It cannot prove Twitch behaves as documented; it does prove the
   package behaves correctly when it does.

   Node has no WebSocket server built in, so the handshake and text
   framing are done by hand below. Only server-to-client text frames
   are needed — EventSub never expects the client to send anything.
   ============================================================ */

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** Encode one server-to-client text frame. Unmasked, per RFC 6455. */
function textFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

export async function startMockTwitch() {
  const state = {
    approved: false,          /* flip to simulate the user approving */
    subscriptions: [],
    sockets: new Set(),
    tokenIssued: 0,
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const body = await new Promise((resolve) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    const form = new URLSearchParams(body);
    const json = (code, obj) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };

    /* --- device flow --- */
    if (url.pathname === '/oauth2/device') {
      return json(200, {
        device_code: 'DEVICE-CODE-1', user_code: 'ABCD-1234',
        verification_uri: 'https://www.twitch.tv/activate',
        interval: 1, expires_in: 600,
      });
    }
    if (url.pathname === '/oauth2/token') {
      if (form.get('grant_type') === 'refresh_token') {
        state.tokenIssued += 1;
        return json(200, { access_token: `refreshed-${state.tokenIssued}`, refresh_token: 'R2' });
      }
      if (!state.approved) return json(400, { message: 'authorization_pending' });
      state.tokenIssued += 1;
      return json(200, { access_token: `token-${state.tokenIssued}`, refresh_token: 'R1', expires_in: 3600 });
    }

    /* --- helix --- */
    if (url.pathname === '/helix/users') {
      return json(200, { data: [{ id: '4242', login: 'catsockstudio', display_name: 'CatSockStudio' }] });
    }
    if (url.pathname === '/helix/eventsub/subscriptions' && req.method === 'POST') {
      const sub = JSON.parse(body || '{}');
      state.subscriptions.push(sub.type);
      return json(202, { data: [{ id: `sub-${state.subscriptions.length}`, status: 'enabled' }] });
    }
    json(404, { error: 'not mocked' });
  });

  /* --- websocket --- */
  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
    state.sockets.add(socket);
    socket.on('close', () => state.sockets.delete(socket));
    socket.on('error', () => state.sockets.delete(socket));

    /* EventSub opens every connection with session_welcome. */
    socket.write(textFrame(JSON.stringify({
      metadata: { message_type: 'session_welcome' },
      payload: { session: { id: 'session-1', keepalive_timeout_seconds: 30 } },
    })));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  return {
    port,
    idBase: `http://127.0.0.1:${port}`,
    apiBase: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}/ws`,
    state,
    /** Simulate the streamer approving the code on twitch.tv/activate. */
    approve() { state.approved = true; },
    /** Push one EventSub notification to every connected client. */
    send(type, event) {
      const frame = textFrame(JSON.stringify({
        metadata: { message_type: 'notification', subscription_type: type },
        payload: { event },
      }));
      for (const s of state.sockets) s.write(frame);
    },
    /** Drop the socket, as Twitch does on a deploy. */
    dropSockets() {
      for (const s of state.sockets) s.destroy();
      state.sockets.clear();
    },
    async close() {
      for (const s of state.sockets) s.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
