import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Terminal context menu:
 *
 *   ┌─────────────────┐
 *   │ Copy            │  (disabled when there is no selection)
 *   │ Paste           │
 *   ├─────────────────┤
 *   │ Select All      │
 *   │ Clear           │
 *   └─────────────────┘
 */
export default function ContextMenu({
  x,
  y,
  hasSelection,
  onClose,
  onCopy,
  onPaste,
  onSelectAll,
  onClear,
}) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x, y });

  // Keep the menu inside the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      x: Math.min(x, window.innerWidth - width - 4),
      y: Math.min(y, window.innerHeight - height - 4),
    });
  }, [x, y]);

  useEffect(() => {
    const onPointerDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('contextmenu', onPointerDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('contextmenu', onPointerDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const run = (fn) => () => {
    onClose();
    fn();
  };

  return (
    <ul
      className="ctx-menu"
      role="menu"
      ref={ref}
      style={{ top: pos.y, left: pos.x }}
    >
      <li
        role="menuitem"
        aria-disabled={!hasSelection}
        className={`ctx-menu__item${hasSelection ? '' : ' ctx-menu__item--disabled'}`}
        onClick={hasSelection ? run(onCopy) : undefined}
      >
        Copy
      </li>
      <li
        role="menuitem"
        className="ctx-menu__item"
        onClick={run(onPaste)}
      >
        Paste
      </li>
      <li role="separator" className="ctx-menu__sep" />
      <li
        role="menuitem"
        className="ctx-menu__item"
        onClick={run(onSelectAll)}
      >
        Select All
      </li>
      <li
        role="menuitem"
        className="ctx-menu__item"
        onClick={run(onClear)}
      >
        Clear
      </li>
    </ul>
  );
}
