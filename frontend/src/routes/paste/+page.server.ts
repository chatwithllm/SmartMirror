import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { setYt } from '$lib/server/ytState.js';

export const load: PageServerLoad = async ({ url }) => ({
  ok: url.searchParams.get('ok') === '1',
  err: url.searchParams.get('err') ?? '',
});

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const raw = (form.get('url') ?? '').toString().trim();
    if (!raw) return fail(400, { err: 'empty' });
    setYt(raw);
    // Fire-and-forget: also try to mirror the value to HA's
    // input_text.mirror_yt_video so anyone watching that entity
    // sees the latest value too. Failure is ignored — the local
    // state is the source of truth.
    void mirrorToHA(raw);
    throw redirect(303, '/paste?ok=1');
  },
};

async function mirrorToHA(value: string): Promise<void> {
  const base = process.env.HA_URL;
  const token = process.env.HA_TOKEN;
  if (!base || !token) return;
  try {
    await fetch(`${base.replace(/\/$/, '')}/api/services/input_text/set_value`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ entity_id: 'input_text.mirror_yt_video', value }),
    });
  } catch {
    /* best-effort */
  }
}
