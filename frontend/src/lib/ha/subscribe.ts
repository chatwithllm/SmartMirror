import type { HAClient } from './client.js';
import { layoutStore } from '$lib/layout/store.js';
import { toasts } from '$lib/stores/connection.js';
import { resolveLayout } from '$lib/layout/resolver.js';
import type { Orientation } from '$lib/layout/schema.js';

interface WireOptions {
  baseUrl: string;
  token?: string;
}

async function fetchState(
  baseUrl: string,
  token: string,
  entityId: string
): Promise<string | null> {
  try {
    const r = await fetch(`${baseUrl}/api/states/${entityId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!r.ok) return null;
    const body = (await r.json()) as { state?: string };
    return body.state ?? null;
  } catch {
    return null;
  }
}

async function applyCurrent(opts: WireOptions, reason: string): Promise<void> {
  if (!opts.token) return;
  const [preset, mode, theme, orientation] = await Promise.all([
    fetchState(opts.baseUrl, opts.token, 'input_select.mirror_preset'),
    fetchState(opts.baseUrl, opts.token, 'input_select.mirror_mode'),
    fetchState(opts.baseUrl, opts.token, 'input_select.mirror_theme'),
    fetchState(opts.baseUrl, opts.token, 'input_select.mirror_orientation')
  ]);

  const resolved = resolveLayout({
    preset: preset ?? undefined,
    mode: (mode as never) ?? undefined,
    theme: (theme as never) ?? undefined,
    orientation: (orientation as Orientation) ?? 'portrait'
  });

  if (!resolved) {
    toasts.push('warn', `no bundled layout for ${mode}.${orientation}`);
    return;
  }

  const nextRev = Date.now();
  layoutStore.setLayout(resolved.layout, nextRev);
  if (reason === 'change') {
    toasts.push('info', `layout → ${resolved.picked.mode} / ${resolved.picked.theme}`, 2500);
  }
}

/**
 * Watch HA for changes to the mirror input_selects. Every change triggers
 * a local re-resolution against the bundled layout set — no reliance on
 * python_script writing a layout file or sensor attribute.
 */
export async function wireLayoutUpdates(
  client: HAClient,
  opts: WireOptions
): Promise<() => void> {
  const watched = new Set([
    'input_select.mirror_preset',
    'input_select.mirror_mode',
    'input_select.mirror_theme',
    'input_select.mirror_orientation'
  ]);

  // Initial pull so mirror matches HA state on boot.
  await applyCurrent(opts, 'boot');

  const onState = async (data: unknown) => {
    const ev = data as { entity_id?: string };
    if (!ev?.entity_id || !watched.has(ev.entity_id)) return;
    await applyCurrent(opts, 'change');
  };
  const off = client.onEvent('state_changed', onState);
  return off;
}
