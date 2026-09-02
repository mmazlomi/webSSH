# web-ssh-terminal

Browser SSH client. Multi-tab [xterm.js](https://xtermjs.org/) front end (React), thin
Node back end (`ssh2` + `ws`). Built for correct, unobtrusive **copy / paste** that
never fights the remote shell.

```
browser (xterm.js, React)  <--WebSocket-->  Node (ws + ssh2)  <--SSH-->  remote host
        ^ clipboard lives here, only here
```

## Performance

Terminal I/O travels as **raw binary WebSocket frames** in both directions — no
base64, no per-chunk JSON (control messages stay JSON text frames). The server
**coalesces** everything the SSH channel emits within a tick into one frame, and
applies **backpressure** (pauses the SSH read side when the socket buffer passes
1 MiB, resumes under 256 KiB) so bulk output can't pile up as lag. The client
renders with the **WebGL addon** (falls back to the DOM renderer if WebGL is
unavailable). Measured ~20 MB/s end-to-end through the pipe on loopback — for
real use the limiting factor is round-trip latency to the SSH host, not this
layer.

## Run

```bash
npm install

# dev: Vite on :5173 (proxies /ws to the backend), backend on :3001
npm run dev

# production: build static assets, serve everything from the Node process on :3001
npm run serve
# PORT=8080 npm run serve   # override port
```

Open the URL, fill in host / port / user / password (or private key), Connect.
`+` opens another tab; each tab is an independent SSH session.

## Copy / paste

| Action | Binding |
| --- | --- |
| Select text | mouse drag (native xterm selection, untouched) |
| **Copy** selection | `Ctrl+Shift+C`, or right-click → **Copy** |
| **Paste** | `Ctrl+Shift+V`, `Shift+Insert`, or right-click → **Paste** |
| Select all | right-click → **Select All** |
| Clear scrollback | right-click → **Clear** |

Right-click menu:

```
┌─────────────────┐
│ Copy            │  ← disabled when nothing is selected; copies only the selection
│ Paste           │
├─────────────────┤
│ Select All      │
│ Clear           │
└─────────────────┘
```

### What is deliberately **not** touched

`Ctrl+C`, `Ctrl+V`, `Ctrl+D`, `Ctrl+Z`, `Ctrl+L`, `Ctrl+A`, `Ctrl+E`, `Ctrl+R` and
every other control sequence pass straight through to the remote PTY. Only
`Ctrl+Shift+C`, `Ctrl+Shift+V` and `Shift+Insert` are intercepted (in
`TerminalView.jsx`, via `attachCustomKeyEventHandler`). `Ctrl+C` with no selection
is still SIGINT.

### Clipboard API + fallback

- Uses `navigator.clipboard.writeText` / `readText` when available in a secure
  context (`https://` or `http://localhost`).
- **Copy** fallback: off-screen `<textarea>` + `document.execCommand('copy')`.
- **Paste** fallback (non-secure context, denied permission, or Firefox — which
  does not give web pages `readText`): a small modal where you press your own
  `Ctrl+V` and confirm.
- The clipboard is read/written **only** in response to an explicit Copy/Paste
  action, is never sent over the WebSocket, and is never stored on the server.

### Paste into interactive apps

Paste goes through `term.paste()`, so xterm wraps it in bracketed-paste markers
(`ESC[200~ … ESC[201~`) when the remote app requested them and normalises
newlines to CR otherwise. Verified targets: `bash`, `vim`, `nano`, `tmux`,
Python REPL.

### HTTPS note

For LAN access (not `localhost`), serve over TLS so the async Clipboard API is
available — e.g. put nginx/Caddy in front, or an SSH tunnel to `localhost`.
Without TLS everything still works: copy uses the `execCommand` fallback and
paste uses the modal.

## Manual test checklist

Run each in an SSH session opened through the app.

- [ ] Select with mouse → `Ctrl+Shift+C` → paste elsewhere: matches
- [ ] Right-click with no selection → **Copy** is greyed out
- [ ] Right-click with selection → **Copy** copies exactly the selection
- [ ] `Ctrl+Shift+V` and `Shift+Insert` both paste
- [ ] Multi-line copy keeps line breaks
- [ ] English / digits / `!@#$%^&*()_+-=[]{}|;':",./<>?` round-trip
- [ ] Persian / Arabic RTL text round-trips (`echo "سلام دنیا ۱۲۳"`, select, copy, paste)
- [ ] Long single-line paste (a few KB) arrives intact
- [ ] Multi-line command paste into `bash` runs correctly
- [ ] Paste into `vim` insert mode: no auto-indent cascade (bracketed paste)
- [ ] Paste into `nano`
- [ ] Paste inside `tmux`
- [ ] Paste a multi-line block into the Python REPL
- [ ] `Ctrl+C` interrupts a running process (e.g. `sleep 100`)
- [ ] `Ctrl+D`, `Ctrl+Z`, `Ctrl+L`, `Ctrl+A`, `Ctrl+E`, `Ctrl+R` behave normally
- [ ] Tab 1: select + copy → Tab 2: paste → works (shared OS clipboard, no server round-trip)
- [ ] Resize the window → remote `stty size` / `tput cols` updates

## Layout

```
server/index.js                 Express static host + /ws WebSocket <-> ssh2 shell
vite.config.js                  client root, dist output, /ws dev proxy
client/index.html
client/src/App.jsx              tab strip + session list
client/src/components/
  TerminalView.jsx              xterm instance, WebGL renderer, binary WS transport,
                                key + context-menu wiring
  ContextMenu.jsx               Copy / Paste / Select All / Clear
  PasteFallback.jsx             manual-paste modal
  NewConnectionDialog.jsx       connection form
client/src/lib/clipboard.js     Clipboard API wrapper + fallbacks
client/src/styles.css
```

## Security notes

- Credentials are sent over the WebSocket to the backend, which uses them once to
  open the SSH connection and never persists them. Use TLS in any real
  deployment.
- The backend is a byte pipe: it does not parse, log, or store session content.
- No auth on the WebSocket endpoint itself — run it behind your own auth /
  network boundary if exposed beyond localhost.
