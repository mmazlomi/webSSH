import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend lives in client/, builds into dist/ which the Node server serves in production.
// In dev, Vite runs on 5173 and proxies the WebSocket endpoint to the SSH backend on 3001.
export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
