import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ url }) => ({
  ok: url.searchParams.get('ok') === '1',
  err: url.searchParams.get('err') ?? '',
});

async function haCall(path: string, body: unknown) {
  const base = process.env.HA_URL;
  const token = process.env.HA_TOKEN;
  if (!base || !token) throw new Error('no-ha-config');
  const r = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    const snippet = text.slice(0, 120).replace(/\s+/g, ' ').trim();
    throw new Error(`ha-${r.status}${snippet ? `: ${snippet}` : ''}`);
  }
}

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const raw = (form.get('url') ?? '').toString().trim();
    if (!raw) return fail(400, { err: 'empty' });

    try {
      // Writing to the same input_text that the mirror frontend polls
      // every 2 s for YouTube loads. Share one code path, no separate
      // socket.
      await haCall('/api/services/input_text/set_value', {
        entity_id: 'input_text.mirror_yt_video',
        value: raw,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      throw redirect(303, `/paste?err=${encodeURIComponent(msg)}`);
    }
    throw redirect(303, '/paste?ok=1');
  },
};
