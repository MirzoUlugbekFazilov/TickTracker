import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * In development the app calls a relative `/api`, and Vite proxies that to the
 * Node server. Two reasons this beats pointing the browser straight at
 * http://localhost:4000:
 *
 *  - No CORS preflight in the common path, because to the browser the API is
 *    same-origin. (The server still sets CORS headers, for the case where the
 *    two are genuinely deployed apart.)
 *  - The production build hard-codes nothing. Behind one origin the same
 *    relative `/api` just works, and VITE_API_BASE_URL overrides it when the
 *    API lives on its own host.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
