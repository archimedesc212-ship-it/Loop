import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: Vite on :5173 proxies /api to the Express API on :4000.
// Prod: `npm run build` then the API serves frontend/dist on the same origin.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
  preview: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
  // `npm run test:web` — component and unit tests in a simulated DOM (jsdom); no server needed
  test: { environment: 'jsdom', include: ['src/**/*.test.{js,jsx}'], restoreMocks: true },
});
