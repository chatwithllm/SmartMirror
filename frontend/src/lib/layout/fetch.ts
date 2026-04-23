import { safeParseLayout, type Layout } from './schema.js';
import { toasts } from '$lib/stores/connection.js';
import { enforceSingleAudio } from '$lib/audio/single-audio.js';

export interface FetchedLayout {
  layout: Layout;
  revision: number;
}

/**
 * Fetch the current layout JSON published by HA (or bundled fixture when
 * in demo mode). Validates with zod; on failure, toasts + throws so the
 * caller can keep the previous layout rendered.
 */
export async function fetchLayout(opts: {
  baseUrl?: string;
  revision: number;
  demoUrl?: string;
}): Promise<FetchedLayout> {
  const url = opts.demoUrl ?? `${opts.baseUrl ?? ''}/local/mirror/layout.json?rev=${opts.revision}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    toasts.push('error', `layout fetch failed: HTTP ${res.status}`);
    throw new Error(`layout fetch ${res.status}`);
  }
  const raw = await res.json();
  const parsed = safeParseLayout(raw);
  if (!parsed.ok) {
    toasts.push('error', `invalid layout at rev ${opts.revision}`);
    throw new Error('invalid layout');
  }
  const { layout, conflict } = enforceSingleAudio(parsed.layout);
  if (conflict) {
    toasts.push(
      'warn',
      `audio conflict: kept ${conflict.kept}, muted ${conflict.muted.join(', ')}`
    );
  }
  return { layout, revision: opts.revision };
}
