import type { HAClient } from './client.js';
import { fetchLayout } from '$lib/layout/fetch.js';
import { layoutStore } from '$lib/layout/store.js';
import { toasts } from '$lib/stores/connection.js';

/**
 * Subscribe to `sensor.mirror_layout_revision` state_changed. On every
 * bump, pull the fresh layout from HA REST (or the legacy www/mirror path),
 * validate, and push into the layout store. Errors are toasted; the
 * previous layout stays rendered.
 */
export async function wireLayoutUpdates(
  client: HAClient,
  opts: { baseUrl: string; token?: string; revisionEntity?: string } = { baseUrl: '' }
): Promise<() => void> {
  const entity = opts.revisionEntity ?? 'sensor.mirror_layout_revision';
  let lastRev = -1;

  const onState = async (data: unknown) => {
    const ev = data as { entity_id: string; new_state: { state: string } };
    if (!ev?.entity_id || ev.entity_id !== entity) return;
    const rev = Number(ev.new_state?.state ?? 0);
    if (!Number.isFinite(rev) || rev <= lastRev) return;
    lastRev = rev;
    try {
      const { layout } = await fetchLayout({
        baseUrl: opts.baseUrl,
        token: opts.token,
        revision: rev
      });
      layoutStore.setLayout(layout, rev);
    } catch (err) {
      toasts.push(
        'warn',
        `layout fetch failed, keeping previous (${(err as Error).message})`
      );
    }
  };

  const off = client.onEvent('state_changed', onState);
  return off;
}
