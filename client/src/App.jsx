import React, { useCallback, useState } from 'react';
import TerminalView from './components/TerminalView.jsx';
import NewConnectionDialog from './components/NewConnectionDialog.jsx';

let seq = 0;

export default function App() {
  const [tabs, setTabs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(true);

  const openTab = useCallback((conn) => {
    const id = ++seq;
    setTabs((t) => [
      ...t,
      { id, conn, title: `${conn.username}@${conn.host}` },
    ]);
    setActiveId(id);
    setDialogOpen(false);
  }, []);

  const closeTab = useCallback((id) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      setActiveId((cur) => {
        if (cur !== id) return cur;
        if (next.length === 0) return null;
        const fallback = next[idx] ?? next[idx - 1] ?? next[0];
        return fallback.id;
      });
      return next;
    });
  }, []);

  const setTitle = useCallback((id, title) => {
    if (!title) return;
    setTabs((t) => t.map((x) => (x.id === id ? { ...x, title } : x)));
  }, []);

  return (
    <div className="app">
      <div className="tabbar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab${tab.id === activeId ? ' tab--active' : ''}`}
            onClick={() => setActiveId(tab.id)}
            title={tab.title}
          >
            <span className="tab__title">{tab.title}</span>
            <button
              className="tab__close"
              aria-label="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          className="tab__new"
          aria-label="New session"
          onClick={() => setDialogOpen(true)}
        >
          +
        </button>
      </div>

      <div className="workspace">
        {tabs.map((tab) => (
          <TerminalView
            key={tab.id}
            tabId={tab.id}
            conn={tab.conn}
            visible={tab.id === activeId}
            onTitle={setTitle}
          />
        ))}

        {tabs.length === 0 && !dialogOpen && (
          <div className="empty-state">
            <p>No active sessions.</p>
            <button className="btn-primary" onClick={() => setDialogOpen(true)}>
              New connection
            </button>
          </div>
        )}
      </div>

      {dialogOpen && (
        <NewConnectionDialog
          onCancel={() => setDialogOpen(false)}
          onConnect={openTab}
        />
      )}
    </div>
  );
}
