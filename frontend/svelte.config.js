import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ out: 'build' }),
    alias: {
      $lib: 'src/lib',
      '$lib/*': 'src/lib/*'
    },
    // LAN-only kiosk. Phones posting to /paste from the same LAN
    // carry a different Origin header than the server sees for the
    // page, which trips SvelteKit's default cross-origin form guard
    // with "Cross-site POST form submissions are forbidden". The
    // admin endpoint already hard-rejects non-local requests, and
    // everything else is read-only, so disabling the origin check
    // globally is safe here.
    csrf: { checkOrigin: false }
  }
};

export default config;
