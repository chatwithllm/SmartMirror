import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { groceryAuthMode, setApiKey } from '$lib/server/groceryClient.js';

export const load: PageServerLoad = async ({ url }) => ({
  mode: await groceryAuthMode(),
  ok: url.searchParams.get('ok') === '1',
  cleared: url.searchParams.get('cleared') === '1',
});

export const actions: Actions = {
  save: async ({ request }) => {
    const form = await request.formData();
    const key = (form.get('key') ?? '').toString().trim();
    if (!key) return fail(400, { err: 'empty' });
    try {
      await setApiKey(key);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'write failed';
      return fail(500, { err: msg });
    }
    throw redirect(303, '/settings/grocery?ok=1');
  },
  clear: async () => {
    await setApiKey('');
    throw redirect(303, '/settings/grocery?cleared=1');
  },
};
