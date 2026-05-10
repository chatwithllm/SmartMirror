import { writable, type Readable } from 'svelte/store';
import type { SectionId } from '$lib/cards/types.js';

const inner = writable<Set<SectionId>>(new Set());
export const emptySections: Readable<Set<SectionId>> = inner;

export function setSectionEmpty(id: SectionId, isEmpty: boolean): void {
  inner.update((s) => {
    const next = new Set(s);
    if (isEmpty) next.add(id);
    else next.delete(id);
    return next;
  });
}

export const SECTION_EMPTY_CTX = Symbol('section.empty');
