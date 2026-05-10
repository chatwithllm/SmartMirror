import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Phone-side setup page hits this to list every HA camera.* entity
// the user can bind to a slot. Snapshot URL is built from HA's
// entity_picture attribute (already fronted by the HA reverse proxy
// on the mirror's LAN), so the phone never needs the long-lived
// token directly.

interface HaState {
  entity_id: string;
  state: string;
  attributes?: { friendly_name?: string; entity_picture?: string };
}

export const GET: RequestHandler = async () => {
  const base = env.HA_URL?.replace(/\/$/, '');
  const token = env.HA_TOKEN;
  if (!base || !token) throw error(500, 'HA_URL or HA_TOKEN not configured');

  const r = await fetch(`${base}/api/states`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) throw error(r.status, 'failed to fetch HA states');
  const all = (await r.json()) as HaState[];

  const cameras = all
    .filter((e) => e.entity_id.startsWith('camera.'))
    .map((e) => ({
      entity_id: e.entity_id,
      friendly_name: e.attributes?.friendly_name ?? e.entity_id,
      snapshot_url: e.attributes?.entity_picture
        ? `${base}${e.attributes.entity_picture}`
        : null
    }))
    .sort((a, b) => a.friendly_name.localeCompare(b.friendly_name));

  return json({ cameras });
};
