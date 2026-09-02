import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';

import { copyText, readText, ClipboardReadUnavailable } from '../lib/clipboard.js';
import ContextMenu from './ContextMenu.jsx';
import PasteFallback from './PasteFallback.jsx';

const encoder = new TextEncoder();

/**
 * One SSH session in one xterm.js instance.
 *
 * Copy / paste model
 * ------------------
 *  - Mouse selection: xterm's native behaviour, untouched.
 *  - Ctrl+Shift+C : copy the current terminal selection (no-op if nothing selected).
 *  - Ctrl+Shift+V : paste from the clipboard.
 *  - Shift+Insert : paste from the clipboard.
 *  - Right-click  : terminal context menu (Copy / Paste / Select All / Clear).
 *  - Ctrl+C / Ctrl+V are NEVER intercepted — Ctrl+C reaches the remote shell as
 *    SIGINT, Ctrl+V reaches it literally. Same for Ctrl+D/Z/L/A/E/R and friends.
 *  - Pasting uses term.paste(), so xterm wraps the text in bracketed-paste
 *    markers when the remote app asked for them (vim, nano, tmux, bash, the
 *    Python REPL, …) and normalises newlines to CR otherwise.
 *  - Every clipboard touch is client-side and gesture-initiated. Nothing is sent
 *    to the server; each tab shares only the OS clipboard.
 */
function TerminalView({ tabId, conn, visible, onTitle }) {
  const hostRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const wsRef = useRef(null);

  const [menu, setMenu] = useState(null); // { x, y, hasSelection }
  const [pasteFallback, setPasteFallback] = useState(false);
  const [status, setStatus] = useState('connecting');

  // ---- clipboard commands ---------------------------------------------------

  const doCopy = useCallback(async () => {
    const term = termRef.current;
    if (!term) return;
    const selection = term.getSelection();
    if (!selection) return; // nothing selected -> nothing to do
    await copyText(selection);
    term.focus();
  }, []);

  const doPaste = useCallback(async () => {
    const term = termRef.current;
    if (!term) return;
    try {
      const text = await readText();
      if (text) term.paste(text); // bracketed-paste aware
    } catch (err) {
      if (err instanceof ClipboardReadUnavailable) {
        setPasteFallback(true); // show manual paste box
        return;
      }
      throw err;
    }
    term.focus();
  }, []);

  const doSelectAll = useCallback(() => {
    termRef.current?.selectAll();
    termRef.current?.focus();
  }, []);

  const doClear = useCallback(() => {
    termRef.current?.clear();
    termRef.current?.focus();
  }, []);

  const onManualPaste = useCallback((text) => {
    setPasteFallback(false);
    if (text) termRef.current?.paste(text);
    termRef.current?.focus();
  }, []);

  // ---- terminal + websocket lifetime --------------------------------------

  useEffect(() => {
    const term = new Terminal({
      allowProposedApi: true, // required by the unicode11 addon
      cursorBlink: true,
      fontSize: 14,
      fontFamily:
        '"Cascadia Mono", "MesloLGS NF", "JetBrains Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace',
      scrollback: 10000,
      macOptionIsMeta: true,
      rightClickSelectsWord: false, // we drive the context menu ourselves
      theme: {
        background: '#161616',
        foreground: '#e4e4e4',
        cursor: '#e4e4e4',
        selectionBackground: '#3a5f8a',
      },
    });

    const fit = new FitAddon();
    const unicode11 = new Unicode11Addon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.loadAddon(unicode11);
    term.unicode.activeVersion = '11'; // correct width for CJK / emoji / combining marks

    term.open(hostRef.current);

    // GPU renderer — big win on scrolling and bulk output. Falls back to the
    // DOM renderer automatically if WebGL is unavailable or the context is lost.
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      /* no WebGL — xterm keeps the DOM renderer */
    }

    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    // Intercept ONLY the copy/paste combos. Everything else returns true and is
    // processed by xterm as usual (and thus forwarded to the remote shell).
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;

      const ctrlShiftOnly = e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey;

      if (ctrlShiftOnly && (e.code === 'KeyC' || e.key.toLowerCase() === 'c')) {
        e.preventDefault();
        doCopy();
        return false;
      }
      if (ctrlShiftOnly && (e.code === 'KeyV' || e.key.toLowerCase() === 'v')) {
        e.preventDefault();
        doPaste();
        return false;
      }
      if (
        e.shiftKey &&
        e.code === 'Insert' &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey
      ) {
        e.preventDefault();
        doPaste();
        return false;
      }
      return true;
    });

    // ---- transport ----
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    wsRef.current = ws;

    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          t: 'connect',
          host: conn.host,
          port: conn.port,
          username: conn.username,
          password: conn.password || '',
          privateKey: conn.privateKey || '',
          passphrase: conn.passphrase || '',
          cols: term.cols,
          rows: term.rows,
        }),
      );
    };

    ws.onmessage = (ev) => {
      // Binary frame == terminal output. xterm decodes UTF-8 and reassembles
      // sequences split across frames.
      if (typeof ev.data !== 'string') {
        term.write(new Uint8Array(ev.data));
        return;
      }
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.t === 'status') {
        setStatus(msg.s);
        if (msg.s === 'connected') term.focus();
      } else if (msg.t === 'error') {
        term.write(`\r\n\x1b[31m[connection error] ${msg.m}\x1b[0m\r\n`);
        setStatus('error');
      }
    };

    ws.onclose = () => {
      setStatus((s) => (s === 'error' ? s : 'disconnected'));
      term.write('\r\n\x1b[33m[session closed]\x1b[0m\r\n');
    };

    // stdin: typed keys AND text handed over by term.paste().
    // Binary frame so the server can pipe it straight to the SSH channel.
    const dataSub = term.onData((d) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(encoder.encode(d));
      }
    });

    // Raw byte replies (e.g. answerback to certain queries).
    const binSub = term.onBinary((s) => {
      if (ws.readyState === WebSocket.OPEN) {
        const bytes = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
        ws.send(bytes);
      }
    });

    const resizeSub = term.onResize(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ t: 'resize', cols: term.cols, rows: term.rows }));
      }
    });

    const titleSub = term.onTitleChange((title) => onTitle?.(tabId, title));

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* element hidden / zero-sized */
      }
    });
    ro.observe(hostRef.current);

    return () => {
      dataSub.dispose();
      binSub.dispose();
      resizeSub.dispose();
      titleSub.dispose();
      ro.disconnect();
      try {
        ws.close();
      } catch {
        /* noop */
      }
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      wsRef.current = null;
    };
    // Mount once per session. conn is created fresh per tab and never mutated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fit + focus whenever this tab becomes the active one (xterm can't measure
  // itself while display:none, so fitting must wait until it is shown again).
  useEffect(() => {
    if (!visible) return;
    const id = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
      } catch {
        /* noop */
      }
      termRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [visible]);

  // ---- context menu ----
  const onContextMenu = (e) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      hasSelection: !!termRef.current?.getSelection(),
    });
  };

  return (
    <div className={`term-view${visible ? '' : ' term-view--hidden'}`}>
      <div className="term-host" ref={hostRef} onContextMenu={onContextMenu} />

      <div className={`term-statusbar term-statusbar--${status}`}>
        <span>
          {conn.username}@{conn.host}:{conn.port}
        </span>
        <span className="term-statusbar__state">{status}</span>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          hasSelection={menu.hasSelection}
          onClose={() => setMenu(null)}
          onCopy={doCopy}
          onPaste={doPaste}
          onSelectAll={doSelectAll}
          onClear={doClear}
        />
      )}

      {pasteFallback && (
        <PasteFallback
          onCancel={() => setPasteFallback(false)}
          onPaste={onManualPaste}
        />
      )}
    </div>
  );
}

// The terminal owns its own imperative state (xterm + socket). Re-render it only
// when its own props change — not every time a sibling tab updates its title.
export default React.memo(TerminalView);
