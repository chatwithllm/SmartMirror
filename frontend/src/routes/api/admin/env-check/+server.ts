import type { RequestHandler } from './$types';

// Safe env diagnostic: reports which expected keys are set in the
// mirror-frontend process env. Boolean-only; never returns values.
const EXPECTED = [
  'HA_URL',
  'HA_TOKEN',
  'MIRROR_LAN_URL',
  'GROCERY_URL',
  'GROCERY_KEY',
  'GROCERY_EMAIL',
  'GROCERY_PASSWORD',
  'GOOGLE_MAPS_KEY',
];

export const GET: RequestHandler = async () => {
  const out: Record<string, boolean> = {};
  for (const k of EXPECTED) {
    out[k] = Boolean(process.env[k]?.trim());
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
