import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_PORT = process.env.PORT ?? '3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Same-origin strategy: the browser only ever talks to the Vite origin,
      // which forwards /api to Express. Session cookies stay first-party, and
      // dev matches production (where Express serves these assets itself).
      '/api': {
        target: `http://localhost:${API_PORT}`,
        // Left false on purpose: the Host header stays localhost so cookie
        // domains behave the same as they will in production.
        changeOrigin: false,
      },
    },
  },
});
