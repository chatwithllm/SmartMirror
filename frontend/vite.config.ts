import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  // Vitest + Svelte 5 + happy-dom: resolve the browser build of Svelte
  // so `onMount` + lifecycle functions work in the test env.
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup-vitest.ts']
  },
  server: {
    port: 5173,
    host: '0.0.0.0'
  }
});
