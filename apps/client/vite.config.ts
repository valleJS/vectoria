import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Dev only: forward the game socket to the server so the client can use a same-origin URL.
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
});
