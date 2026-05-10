import { writable, type Readable } from 'svelte/store';
import type { CardId, ChannelConfig, SectionId } from '$lib/cards/types.js';
import type { Phase } from '$lib/phase/clock.js';
import { OVERRIDE_TIMEOUT_MS } from './config.js';

export interface ChannelState {
  pool: CardId[];
  phaseDefaults: Record<Phase, CardId>;
  currentCardId: CardId;
  override?: { cardId: CardId; expiresAt: number };
}

export interface ChannelHandle {
  state: Readable<ChannelState>;
  cycleNext: () => void;
  cyclePrev: () => void;
  applyPhaseDefault: (p: Phase) => void;
  clearOverride: (p: Phase) => void;
  tickOverrides: (p: Phase) => void;
}

export function createChannelStore(
  _id: SectionId,
  cfg: ChannelConfig,
  initialPhase: Phase
): ChannelHandle {
  const inner = writable<ChannelState>({
    pool: cfg.pool,
    phaseDefaults: cfg.phaseDefaults,
    currentCardId: cfg.phaseDefaults[initialPhase]
  });

  function cycleBy(delta: 1 | -1) {
    inner.update((s) => {
      const i = s.pool.indexOf(s.currentCardId);
      const len = s.pool.length;
      const next = s.pool[(i + delta + len) % len];
      return {
        ...s,
        currentCardId: next,
        override: { cardId: next, expiresAt: Date.now() + OVERRIDE_TIMEOUT_MS }
      };
    });
  }

  return {
    state: inner,
    cycleNext: () => cycleBy(1),
    cyclePrev: () => cycleBy(-1),
    applyPhaseDefault: (phase) =>
      inner.update((s) => {
        if (s.override && s.override.expiresAt > Date.now()) return s;
        return { ...s, override: undefined, currentCardId: s.phaseDefaults[phase] };
      }),
    clearOverride: (phase) =>
      inner.update((s) => ({
        ...s,
        override: undefined,
        currentCardId: s.phaseDefaults[phase]
      })),
    tickOverrides: (phase) =>
      inner.update((s) => {
        if (!s.override) return s;
        if (s.override.expiresAt > Date.now()) return s;
        return { ...s, override: undefined, currentCardId: s.phaseDefaults[phase] };
      })
  };
}
