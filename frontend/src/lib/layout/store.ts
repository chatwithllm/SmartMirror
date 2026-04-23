import { writable, derived, get, type Readable } from 'svelte/store';
import type { Layout } from './schema.js';
import { diffLayouts, type Patch } from './diff.js';

export interface LayoutState {
  current: Layout | null;
  previous: Layout | null;
  revision: number;
  updatedAt: number;
  lastPatches: Patch[];
}

const initial: LayoutState = {
  current: null,
  previous: null,
  revision: 0,
  updatedAt: 0,
  lastPatches: []
};

function createLayoutStore() {
  const { subscribe, update, set } = writable<LayoutState>(initial);

  return {
    subscribe,
    set,
    setLayout(next: Layout, revision = 0) {
      update((state) => {
        const prev = state.current;
        const { patches } = diffLayouts(prev, next);
        return {
          current: next,
          previous: prev,
          revision,
          updatedAt: Date.now(),
          lastPatches: patches
        };
      });
    },
    current(): Layout | null {
      return get({ subscribe }).current;
    },
    reset() {
      set(initial);
    }
  };
}

export const layoutStore = createLayoutStore();

export const currentLayout: Readable<Layout | null> = derived(
  layoutStore,
  ($s) => $s.current
);
