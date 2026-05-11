import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { createChannelStore } from './channel.js';

const cfg = {
  pool: ['a', 'b', 'c'],
  phaseDefaults: {
    pratah: 'a',
    madhyahna: 'b',
    sandhya: 'c',
    ratri: 'a'
  }
} as const;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 4, 9, 8, 0, 0, 0));
});

describe('createChannelStore', () => {
  it('initializes with the phase default', () => {
    const ch = createChannelStore('section-2', cfg as never, 'pratah');
    expect(get(ch.state).currentCardId).toBe('a');
    expect(get(ch.state).override).toBeUndefined();
  });

  it('cycleNext advances to next pool entry and sets override', () => {
    const ch = createChannelStore('section-2', cfg as never, 'pratah');
    ch.cycleNext();
    const s = get(ch.state);
    expect(s.currentCardId).toBe('b');
    expect(s.override?.cardId).toBe('b');
    expect(s.override?.expiresAt).toBeGreaterThan(Date.now());
  });

  it('cycleNext wraps from last pool entry to first', () => {
    const ch = createChannelStore('section-2', cfg as never, 'sandhya');
    expect(get(ch.state).currentCardId).toBe('c');
    ch.cycleNext();
    expect(get(ch.state).currentCardId).toBe('a');
  });

  it('cyclePrev rewinds and wraps from first to last', () => {
    const ch = createChannelStore('section-2', cfg as never, 'pratah');
    expect(get(ch.state).currentCardId).toBe('a');
    ch.cyclePrev();
    expect(get(ch.state).currentCardId).toBe('c');
  });

  it('applyPhaseDefault swaps to phase default when no override', () => {
    const ch = createChannelStore('section-2', cfg as never, 'pratah');
    ch.applyPhaseDefault('madhyahna');
    expect(get(ch.state).currentCardId).toBe('b');
  });

  it('applyPhaseDefault leaves override in place when active', () => {
    const ch = createChannelStore('section-2', cfg as never, 'pratah');
    ch.cycleNext(); // override = b, expires in 10min
    ch.applyPhaseDefault('madhyahna');
    expect(get(ch.state).currentCardId).toBe('b'); // override won
    expect(get(ch.state).override?.cardId).toBe('b');
  });

  it('tickOverrides clears expired override and snaps to phase default', () => {
    const ch = createChannelStore('section-2', cfg as never, 'pratah');
    ch.cycleNext(); // override active for 10min
    expect(get(ch.state).currentCardId).toBe('b');

    vi.advanceTimersByTime(11 * 60 * 1000); // 11 min later
    ch.tickOverrides('pratah'); // current phase still pratah
    expect(get(ch.state).override).toBeUndefined();
    expect(get(ch.state).currentCardId).toBe('a'); // back to phase default
  });

  it('clearOverride snaps back to current phase default', () => {
    const ch = createChannelStore('section-2', cfg as never, 'pratah');
    ch.cycleNext();
    expect(get(ch.state).currentCardId).toBe('b');
    ch.clearOverride('pratah');
    expect(get(ch.state).override).toBeUndefined();
    expect(get(ch.state).currentCardId).toBe('a');
  });

  describe('HA pin', () => {
    it('setPin forces currentCardId and overrides phase default', () => {
      const ch = createChannelStore('section-2', cfg as never, 'pratah');
      ch.setPin('c' as never, 'pratah');
      expect(get(ch.state).pinnedCardId).toBe('c');
      expect(get(ch.state).currentCardId).toBe('c');
      ch.applyPhaseDefault('madhyahna'); // would normally swap to 'b'
      expect(get(ch.state).currentCardId).toBe('c');
    });

    it('setPin(null) clears pin and snaps back to phase default', () => {
      const ch = createChannelStore('section-2', cfg as never, 'pratah');
      ch.setPin('c' as never, 'pratah');
      expect(get(ch.state).currentCardId).toBe('c');
      ch.setPin(null, 'pratah');
      expect(get(ch.state).pinnedCardId).toBeNull();
      expect(get(ch.state).currentCardId).toBe('a');
    });

    it('gesture override wins over pin until it expires', () => {
      const ch = createChannelStore('section-2', cfg as never, 'pratah');
      ch.setPin('c' as never, 'pratah'); // pinned to c
      ch.cycleNext(); // swipe → override, currentCardId advances from c
      // 'c' is at idx 2, next is idx 0 → 'a'
      expect(get(ch.state).currentCardId).toBe('a');
      expect(get(ch.state).pinnedCardId).toBe('c'); // pin survives
      vi.advanceTimersByTime(11 * 60 * 1000);
      ch.tickOverrides('pratah');
      // Override expired → fall back to pin (not phase default)
      expect(get(ch.state).currentCardId).toBe('c');
    });

    it('setting pin during active override does not displace override', () => {
      const ch = createChannelStore('section-2', cfg as never, 'pratah');
      ch.cycleNext(); // override = 'b'
      expect(get(ch.state).currentCardId).toBe('b');
      ch.setPin('c' as never, 'pratah');
      expect(get(ch.state).currentCardId).toBe('b'); // override still wins
      expect(get(ch.state).pinnedCardId).toBe('c');
      ch.clearOverride('pratah'); // fall back path
      expect(get(ch.state).currentCardId).toBe('c'); // pin
    });
  });
});
