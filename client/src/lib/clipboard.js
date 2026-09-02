/**
 * Clipboard helpers.
 *
 * Rules enforced here:
 *  - The clipboard is only ever touched as the direct result of an explicit user
 *    action (a Copy or Paste command). Nothing on this module polls or reads the
 *    clipboard on its own.
 *  - Clipboard data never leaves the browser. It is never sent over the WebSocket
 *    and never reaches the Node server.
 *  - Prefer the async Clipboard API (navigator.clipboard). Fall back gracefully
 *    when it is unavailable (non-secure context, no permission, Firefox readText,
 *    older browsers).
 */

export class ClipboardReadUnavailable extends Error {
  constructor() {
    super('Clipboard read is not available in this browser/context');
    this.name = 'ClipboardReadUnavailable';
  }
}

const canAsyncWrite = () =>
  typeof navigator !== 'undefined' &&
  navigator.clipboard &&
  typeof navigator.clipboard.writeText === 'function' &&
  window.isSecureContext;

const canAsyncRead = () =>
  typeof navigator !== 'undefined' &&
  navigator.clipboard &&
  typeof navigator.clipboard.readText === 'function' &&
  window.isSecureContext;

/**
 * Copy `text` to the clipboard. Returns true on success.
 * Handles multi-line and Unicode (incl. Persian/Arabic RTL) transparently —
 * it is all just a JS string.
 */
export async function copyText(text) {
  if (text == null || text === '') return false;

  if (canAsyncWrite()) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // permission denied / transient — fall through to legacy path
    }
  }
  return legacyCopy(text);
}

/**
 * Read text from the clipboard.
 * Throws ClipboardReadUnavailable when the browser will not allow a
 * programmatic read (the caller should then show a manual-paste fallback).
 */
export async function readText() {
  if (canAsyncRead()) {
    try {
      return await navigator.clipboard.readText();
    } catch {
      // Chrome: permission dismissed. Firefox: not supported for web content.
      throw new ClipboardReadUnavailable();
    }
  }
  throw new ClipboardReadUnavailable();
}

/** Legacy execCommand('copy') via an off-screen textarea. */
function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);

  const selection = document.getSelection();
  const previous = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  ta.select();
  ta.setSelectionRange(0, ta.value.length);

  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }

  document.body.removeChild(ta);
  if (previous && selection) {
    selection.removeAllRanges();
    selection.addRange(previous);
  }
  return ok;
}
