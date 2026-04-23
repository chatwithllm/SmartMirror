import type { LayoutServerLoad } from './$types';

// Bridge /etc/mirror/config.env (consumed via systemd EnvironmentFile)
// into the client-side runtime. The kiosk is LAN-only and already has
// the long-lived token on disk, so exposing it to the bundled HTML is
// a deliberate tradeoff — it avoids another round-trip.
export const load: LayoutServerLoad = () => {
  return {
    haUrl: process.env.HA_URL ?? '',
    haToken: process.env.HA_TOKEN ?? ''
  };
};
