import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Writes the user's chosen camera entity into the matching
// input_text.mirror_camera_slot_N helper. Empty entity_id is allowed
// and clears the slot back to the QR placeholder.

interface BindBody {
  slot: number;
  entity_id: string;
}

export const POST: RequestHandler = async ({ request }) => {
  const base = env.HA_URL?.replace(/\/$/, '');
  const token = env.HA_TOKEN;
  if (!base || !token) throw error(500, 'HA_URL or HA_TOKEN not configured');

  let body: BindBody;
  try {
    body = (await request.json()) as BindBody;
  } catch {
    throw error(400, 'invalid json');
  }
  const slot = Number(body.slot);
  if (!Number.isInteger(slot) || slot < 0 || slot > 4) {
    throw error(400, 'slot must be integer 0-4');
  }
  // Allow empty entity_id (clears the slot) or a valid camera.* id.
  const entityId = String(body.entity_id ?? '').trim();
  if (entityId !== '' && !/^camera\.[a-z0-9_]+$/i.test(entityId)) {
    throw error(400, 'entity_id must be a camera.* id');
  }

  const helperEntity = `input_text.mirror_camera_slot_${slot}`;
  const r = await fetch(`${base}/api/services/input_text/set_value`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ entity_id: helperEntity, value: entityId })
  });
  if (!r.ok) throw error(r.status, 'HA service call failed');

  return json({ ok: true, slot, entity_id: entityId });
};
