import type { LayoutServerLoad } from './$types';
import os from 'node:os';
import { env } from '$env/dynamic/private';

// Detect a LAN-routable IPv4 on the mirror host. The kiosk browser
// always talks to http://localhost:3000, but the QR code in the
// YouTube tile has to point at something a phone on the same LAN can
// reach. Honor MIRROR_LAN_URL override when set; otherwise pick the
// first non-internal IPv4 interface.
function detectLanUrl(): string {
  const override = env.MIRROR_LAN_URL?.trim();
  if (override) return override.replace(/\/$/, '');
  const port = env.PORT ?? '3000';
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const addr of ifs[name] ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return `http://${addr.address}:${port}`;
      }
    }
  }
  return '';
}

// Bridge /etc/mirror/config.env (consumed via systemd EnvironmentFile)
// into the client-side runtime. The kiosk is LAN-only and already has
// the long-lived token on disk, so exposing it to the bundled HTML is
// a deliberate tradeoff — it avoids another round-trip.
export const load: LayoutServerLoad = () => {
  return {
    haUrl: env.HA_URL ?? '',
    haToken: env.HA_TOKEN ?? '',
    mirrorLanUrl: detectLanUrl()
  };
};
