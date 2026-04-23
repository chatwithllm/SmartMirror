import type { Layout } from '$lib/layout/schema.js';

export interface AudioGuardResult {
  layout: Layout;
  conflict: null | { kept: string; muted: string[] };
}

/**
 * Enforce: at most one tile may have `audio: true`. If more than one,
 * keep the first (document order), coerce the rest to muted+audio=false.
 * Emits a conflict descriptor for the caller to forward to HA.
 */
export function enforceSingleAudio(layout: Layout): AudioGuardResult {
  const audioTiles = layout.tiles.filter((t) => t.audio);
  if (audioTiles.length <= 1) {
    return { layout, conflict: null };
  }
  const keep = audioTiles[0].id;
  const muted: string[] = [];
  const patched = layout.tiles.map((t) => {
    if (t.audio && t.id !== keep) {
      muted.push(t.id);
      return {
        ...t,
        audio: false,
        props: { ...t.props, muted: true }
      };
    }
    return t;
  });
  return {
    layout: { ...layout, tiles: patched },
    conflict: { kept: keep, muted }
  };
}
