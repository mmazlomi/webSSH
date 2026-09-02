import React from 'react';
import { createRoot } from 'react-dom/client';
import '@xterm/xterm/css/xterm.css';
import './styles.css';
import App from './App.jsx';

// No StrictMode: each terminal tab opens a real SSH session on mount, and
// StrictMode's dev double-mount would trigger a duplicate connect/auth.
createRoot(document.getElementById('root')).render(<App />);
