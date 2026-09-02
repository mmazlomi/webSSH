import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

import express from 'express';
import { WebSocketServer } from 'ws';
import { Client } from 'ssh2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 3001;

const app = express();

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
} else {
  app.get('/', (_req, res) =>
    res
      .status(200)
      .type('text')
      .send('Backend is up. Run `npm run dev` for the client, or `npm run build` first.'),
  );
}

const server = http.createServer(app);

// One WebSocket == one SSH shell session == one browser terminal tab.
// The server is a dumb pipe: it never inspects, stores, or logs terminal payloads,
// and it has no notion of the clipboard at all — copy/paste is 100% client-side.
//
// Wire protocol:
//   - control messages (connect / resize) are JSON *text* frames
//   - status / error from the server are JSON *text* frames
//   - terminal I/O in both directions is raw *binary* frames (no base64, no JSON)
const wss = new WebSocketServer({
  server,
  path: '/ws',
  perMessageDeflate: false, // interactive latency beats bandwidth here
});

// Pause the SSH read side once this much unflushed data has piled up on the
// socket, resume when it drains. Keeps `cat bigfile` from ballooning memory
// and adding seconds of buffered lag.
const HIGH_WATER = 1 << 20; // 1 MiB
const LOW_WATER = 1 << 18; // 256 KiB

wss.on('connection', (ws) => {
  ws._socket?.setNoDelay(true);

  const conn = new Client();
  let stream = null;
  let creds = null;
  let win = { cols: 80, rows: 24 };

  const send = (obj) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  ws.on('message', (raw, isBinary) => {
    // Binary frame == stdin (typed keys / pasted text). Hot path: no parsing.
    if (isBinary) {
      if (stream) stream.write(raw);
      return;
    }

    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.t) {
      case 'connect': {
        creds = msg;
        win = { cols: msg.cols || 80, rows: msg.rows || 24 };
        try {
          conn.connect({
            host: msg.host,
            port: msg.port || 22,
            username: msg.username,
            password: msg.password || undefined,
            privateKey: msg.privateKey || undefined,
            passphrase: msg.passphrase || undefined,
            tryKeyboard: true,
            keepaliveInterval: 15000,
            readyTimeout: 20000,
          });
        } catch (err) {
          send({ t: 'error', m: String(err.message || err) });
        }
        break;
      }

      case 'resize':
        win = { cols: msg.cols, rows: msg.rows };
        if (stream) stream.setWindow(msg.rows, msg.cols, 0, 0);
        break;
    }
  });

  conn.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
    finish(prompts.map(() => (creds && creds.password) || ''));
  });

  conn.on('ready', () => {
    send({ t: 'status', s: 'connected' });
    conn.shell(
      { term: 'xterm-256color', cols: win.cols, rows: win.rows },
      (err, s) => {
        if (err) {
          send({ t: 'error', m: err.message });
          ws.close();
          return;
        }
        stream = s;

        // Coalesce every chunk the SSH channel produces within a tick into a
        // single binary frame — one `yes` or one build log is otherwise
        // thousands of tiny sends.
        let pending = [];
        let flushQueued = false;

        const flush = () => {
          flushQueued = false;
          if (!pending.length || ws.readyState !== ws.OPEN) {
            pending = [];
            return;
          }
          const frame = pending.length === 1 ? pending[0] : Buffer.concat(pending);
          pending = [];
          ws.send(frame, { binary: true }, () => {
            if (stream.isPaused() && ws.bufferedAmount < LOW_WATER) stream.resume();
          });
          if (ws.bufferedAmount > HIGH_WATER) stream.pause();
        };

        const forward = (d) => {
          pending.push(d);
          if (!flushQueued) {
            flushQueued = true;
            setImmediate(flush);
          }
        };

        stream.on('data', forward);
        stream.stderr.on('data', forward);
        stream.on('close', () => conn.end());
      },
    );
  });

  conn.on('error', (err) => send({ t: 'error', m: err.message }));
  conn.on('close', () => {
    send({ t: 'status', s: 'disconnected' });
    ws.close();
  });

  ws.on('close', () => {
    if (stream) stream.end();
    conn.end();
  });
});

server.listen(PORT, () => {
  console.log(`web-ssh-terminal listening on http://localhost:${PORT}`);
});
