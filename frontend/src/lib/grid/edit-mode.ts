import { writable } from 'svelte/store';

export interface EditPatch {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const editMode = writable<boolean>(false);

/**
 * Buffer for patches emitted while the user drags/resizes in edit mode.
 * Flushed via `mirror.patch_layout` service call; Phase 13 wires the
 * actual HA call. For now the buffer is directly observable for tests.
 */
export const editPatchBuffer = writable<EditPatch[]>([]);

export function pushPatch(p: EditPatch) {
  editPatchBuffer.update((list) => {
    const filtered = list.filter((it) => it.id !== p.id);
    return [...filtered, p];
  });
}

export function clearPatchBuffer() {
  editPatchBuffer.set([]);
}
