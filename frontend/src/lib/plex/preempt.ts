import { writable, type Readable } from 'svelte/store';
import { browser } from '$app/environment';
import { watchEntity } from '$lib/ha/entity.js';

const inner = writable<boolean>(false);
export const plexActive: Readable<boolean> = inner;

let started = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Start watching the Plex media_player entity. Idempotent. Writes
 * plexActive=true while state is 'playing', false otherwise. Debounces
 * 2s on each change so paused→playing→paused flicker doesn't thrash
 * the layout.
 */
export function startPlexPreempt(entityId: string): void {
  if (started || !browser) return;
  started = true;

  const w = watchEntity(entityId, 5_000);
  w.store.subscribe((entity) => {
    const playing = entity?.state === 'playing';
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => inner.set(playing), 2_000);
  });
}
