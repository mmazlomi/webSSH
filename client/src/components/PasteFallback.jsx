import React, { useEffect, useRef } from 'react';

/**
 * Shown only when the browser refuses a programmatic clipboard read
 * (no HTTPS / permission denied / Firefox, which does not expose
 * navigator.clipboard.readText to web content).
 *
 * The user pastes into the textarea with their own Ctrl+V, then confirms —
 * so the clipboard is still only read through an explicit user action, and
 * still never leaves the browser.
 */
export default function PasteFallback({ onCancel, onPaste }) {
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const submit = () => onPaste(ref.current?.value ?? '');

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Paste text"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="modal__title">Paste</h3>
        <p className="modal__body">
          This browser blocked direct clipboard access (it needs HTTPS or a
          granted permission). Press <kbd>Ctrl</kbd>+<kbd>V</kbd> in the box
          below, then click <b>Paste</b>.
        </p>
        <textarea
          ref={ref}
          className="modal__textarea"
          rows={5}
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
            if (e.key === 'Escape') onCancel();
          }}
        />
        <div className="modal__actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={submit}>
            Paste
          </button>
        </div>
      </div>
    </div>
  );
}
