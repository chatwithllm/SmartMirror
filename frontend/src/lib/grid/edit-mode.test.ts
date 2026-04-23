import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { editMode, editPatchBuffer, pushPatch, clearPatchBuffer } from './edit-mode.js';

describe('edit-mode patch buffer', () => {
  beforeEach(() => {
    clearPatchBuffer();
    editMode.set(false);
  });

  it('appends a new patch', () => {
    pushPatch({ id: 'a', x: 1, y: 1, w: 2, h: 2 });
    expect(get(editPatchBuffer)).toHaveLength(1);
  });

  it('overwrites a prior patch for the same id', () => {
    pushPatch({ id: 'a', x: 1, y: 1, w: 2, h: 2 });
    pushPatch({ id: 'a', x: 5, y: 5, w: 3, h: 3 });
    const buf = get(editPatchBuffer);
    expect(buf).toHaveLength(1);
    expect(buf[0]).toMatchObject({ x: 5, y: 5, w: 3, h: 3 });
  });

  it('clearPatchBuffer empties the list', () => {
    pushPatch({ id: 'a', x: 1, y: 1, w: 2, h: 2 });
    clearPatchBuffer();
    expect(get(editPatchBuffer)).toHaveLength(0);
  });
});
