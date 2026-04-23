import { safeParseLayout, type Layout } from './schema.js';
import { toasts } from '$lib/stores/connection.js';
import { enforceSingleAudio } from '$lib/audio/single-audio.js';

export interface FetchedLayout {
  layout: Layout;
  revision: number;
}

interface FetchOptions {
  /** HA base URL, e.g. http://ha.local:8123 */
  baseUrl: string;
  /** Long-lived token — required to read sensor attributes via HA REST. */
  token?: string;
  /** Used only for cache-busting when we fall back to the file route. */
  revision: number;
  /** Override endpoint (testing). */
  demoUrl?: string;
}

/**
 * Pull the latest layout. Strategy:
 *   1. If baseUrl + token present → GET HA REST
 *      /api/states/sensor.mirror_layout_file, read the `layout` attribute.
 *      (python_script sandbox can't write `www/mirror/layout.json`, so we
 *       stash the layout as an attribute instead.)
 *   2. Otherwise → legacy GET /local/mirror/layout.json (still works for
 *      installs that use a custom_component to write the file).
 *
 * Validates with zod; on failure toasts + throws so the caller keeps the
 * previous layout rendered.
 */
export async function fetchLayout(opts: FetchOptions): Promise<FetchedLayout> {
  const url = pickUrl(opts);
  const headers: Record<string, string> = {};
  if (opts.baseUrl && opts.token && !opts.demoUrl) {
    headers['Authorization'] = `Bearer ${opts.token}`;
  }
  const res = await fetch(url, { cache: 'no-store', headers });
  if (!res.ok) {
    toasts.push('error', `layout fetch failed: HTTP ${res.status}`);
    throw new Error(`layout fetch ${res.status}`);
  }
  const body = await res.json();
  const raw = extractLayout(body);
  if (!raw) {
    toasts.push('error', `no layout in response (rev ${opts.revision})`);
    throw new Error('empty layout');
  }
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

function pickUrl(opts: FetchOptions): string {
  if (opts.demoUrl) return opts.demoUrl;
  if (opts.baseUrl && opts.token) {
    return `${opts.baseUrl}/api/states/sensor.mirror_layout_file`;
  }
  return `${opts.baseUrl ?? ''}/local/mirror/layout.json?rev=${opts.revision}`;
}

/**
 * The HA REST response wraps our layout inside `.attributes.layout`. Static
 * file responses ARE the layout. Handle both.
 */
function extractLayout(body: unknown): unknown {
  if (!body || typeof body !== 'object') return null;
  const maybeHa = body as { attributes?: { layout?: unknown } };
  if (maybeHa.attributes && maybeHa.attributes.layout) {
    return maybeHa.attributes.layout;
  }
  return body;
}
