import type { RequestHandler } from './$types';
import { writeFileSync } from 'node:fs';

/**
 * Browser heartbeat sink. The kiosk's +page.svelte POSTs here every
 * few seconds while its event loop is alive. We stamp the mtime of a
 * file under /run/mirror/ (a tmpfs RuntimeDirectory provided by
 * mirror-frontend.service). The watchdog reads that mtime — if it's
 * older than a threshold, Chromium is wedged on a stale DOM (the
 * server itself can still be healthy), and the watchdog bounces the
 * browser process.
 *
 * Synchronous + tiny on purpose. If this endpoint hangs, we've lost
 * the diagnostic value of the heartbeat.
 */
const HB_FILE = '/run/mirror/heartbeat';

export const POST: RequestHandler = () => {
  try {
    writeFileSync(HB_FILE, String(Date.now()));
  } catch {
    /* RuntimeDirectory missing — frontend unit predates the change.
     * Heartbeat still succeeds; watchdog will simply have nothing to
     * check until the unit gets reloaded with the directive. */
  }
  return new Response(null, { status: 204 });
};
