# Mirror Daily v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Productionize the `editorial-daily` preset (portrait) with a phase-driven section channel engine, 7 content cards, Plex pre-empt, and gesture-cycle override.

**Architecture:** Time-of-day **phase clock** (Vedic Sanskrit phases) drives a per-section **channel store** that picks default cards from a pool. Manual overrides expire after 10 min. Plex pre-empts sections 2-4 with a full-takeover card. Server proxies provide Immich photo-of-day + HN tech news; all other data sources are existing HA entities or existing app routes.

**Tech Stack:** Svelte 5 + SvelteKit 2 + TypeScript, vitest, Fraunces serif (already loaded), existing `$lib/ha/entity.ts` watcher, existing tile registry.

**Spec:** [`docs/superpowers/specs/2026-05-09-mirror-daily-v1-design.md`](../specs/2026-05-09-mirror-daily-v1-design.md) (commit 36c24c0).

**Rollout discipline:** Tasks group into 9 rollout phases. **At each rollout-phase boundary, run `pnpm dev` and have the user verify in the browser before continuing.** Atomic commits per task; group commits per phase. **No `git push` to `main`, no `installer/remote-deploy.sh`, until Phase 9 final ship gate is approved.**

---

## File Inventory

### New files

```
frontend/src/lib/phase/clock.ts
frontend/src/lib/phase/clock.test.ts
frontend/src/lib/sections/channel.ts
frontend/src/lib/sections/channel.test.ts
frontend/src/lib/sections/config.ts
frontend/src/lib/cards/types.ts
frontend/src/lib/cards/registry.ts
frontend/src/lib/cards/registry.test.ts
frontend/src/lib/plex/preempt.ts
frontend/src/lib/tiles/SectionHostTile.svelte
frontend/src/lib/tiles/CalendarDayCard.svelte
frontend/src/lib/tiles/CalendarNextCard.svelte
frontend/src/lib/tiles/CalendarTomorrowCard.svelte
frontend/src/lib/tiles/TechNewsCard.svelte
frontend/src/lib/tiles/GroceryListCard.svelte
frontend/src/lib/tiles/ImmichPhotoCard.svelte
frontend/src/lib/tiles/WeatherHourlyCard.svelte
frontend/src/lib/tiles/NotificationsCard.svelte
frontend/src/lib/tiles/PlexNowPlayingCard.svelte
frontend/src/routes/api/immich/photo-of-day/+server.ts
frontend/src/routes/api/immich/photo-of-day/server.test.ts
frontend/src/routes/api/immich/asset/[id]/+server.ts
frontend/src/routes/api/news/tech/+server.ts
frontend/src/routes/api/news/tech/server.test.ts
docs/mirror-daily-smoke.md
```

### Modified files

```
frontend/src/lib/tiles/EditorialHeaderTile.svelte
frontend/src/lib/tiles/registry.ts
frontend/src/lib/gesture/handlers.ts
frontend/src/routes/+page.svelte
frontend/src/lib/layout/bundled/editorial.portrait.json
.env.example
installer/remote-deploy.sh
```

---

# Phase 1 — Phase clock + bilingual kicker flip

Smallest visible win. After this phase, the masthead's edition kicker reads from the live phase store and flips between Sanskrit and English every 8 seconds.

## Task 1: Phase clock — types + boundary function (TDD)

**Files:**
- Create: `frontend/src/lib/phase/clock.ts`
- Test: `frontend/src/lib/phase/clock.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/phase/clock.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { phaseAt, type Phase } from './clock.js';

function at(h: number, m = 0): Date {
  const d = new Date(2026, 4, 9, h, m, 0, 0); // 9 May 2026 (locale-stable)
  return d;
}

describe('phaseAt', () => {
  it('returns ratri for hours 22-23', () => {
    expect(phaseAt(at(22))).toBe('ratri');
    expect(phaseAt(at(23, 59))).toBe('ratri');
  });

  it('returns ratri for hours 0-4', () => {
    expect(phaseAt(at(0))).toBe('ratri');
    expect(phaseAt(at(4, 59))).toBe('ratri');
  });

  it('returns pratah from 05:00 to 10:59', () => {
    expect(phaseAt(at(5))).toBe('pratah');
    expect(phaseAt(at(10, 59))).toBe('pratah');
  });

  it('returns madhyahna from 11:00 to 16:59', () => {
    expect(phaseAt(at(11))).toBe('madhyahna');
    expect(phaseAt(at(16, 59))).toBe('madhyahna');
  });

  it('returns sandhya from 17:00 to 21:59', () => {
    expect(phaseAt(at(17))).toBe('sandhya');
    expect(phaseAt(at(21, 59))).toBe('sandhya');
  });

  it('boundary: 11:00 flips pratah to madhyahna', () => {
    expect(phaseAt(at(10, 59))).toBe('pratah');
    expect(phaseAt(at(11, 0))).toBe('madhyahna');
  });

  it('boundary: 17:00 flips madhyahna to sandhya', () => {
    expect(phaseAt(at(16, 59))).toBe('madhyahna');
    expect(phaseAt(at(17, 0))).toBe('sandhya');
  });

  it('boundary: 22:00 flips sandhya to ratri', () => {
    expect(phaseAt(at(21, 59))).toBe('sandhya');
    expect(phaseAt(at(22, 0))).toBe('ratri');
  });

  it('boundary: 05:00 flips ratri to pratah', () => {
    expect(phaseAt(at(4, 59))).toBe('ratri');
    expect(phaseAt(at(5, 0))).toBe('pratah');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test src/lib/phase/clock.test.ts`
Expected: FAIL — `Cannot find module './clock.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/lib/phase/clock.ts`:

```ts
export type Phase = 'pratah' | 'madhyahna' | 'sandhya' | 'ratri';

export function phaseAt(d: Date): Phase {
  const h = d.getHours();
  if (h < 5) return 'ratri';
  if (h < 11) return 'pratah';
  if (h < 17) return 'madhyahna';
  if (h < 22) return 'sandhya';
  return 'ratri';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm test src/lib/phase/clock.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/phase/clock.ts frontend/src/lib/phase/clock.test.ts
git commit -m "feat(phase): phaseAt boundary function with vedic phases"
```

---

## Task 2: Phase store with 60s tick

**Files:**
- Modify: `frontend/src/lib/phase/clock.ts`
- Modify: `frontend/src/lib/phase/clock.test.ts`

- [ ] **Step 1: Append store test to clock.test.ts**

Append to `frontend/src/lib/phase/clock.test.ts`:

```ts
import { get } from 'svelte/store';
import { createPhaseStore } from './clock.js';

describe('createPhaseStore', () => {
  it('emits the phase derived from the now() function', () => {
    const fakeNow = () => new Date(2026, 4, 9, 14, 0, 0, 0); // 14:00 → madhyahna
    const { store, stop } = createPhaseStore(fakeNow, 60_000);
    expect(get(store)).toBe('madhyahna');
    stop();
  });

  it('updates when the underlying time crosses a phase boundary', async () => {
    let h = 10; // pratah
    const fakeNow = () => new Date(2026, 4, 9, h, 59, 0, 0);
    const { store, tick, stop } = createPhaseStore(fakeNow, 60_000);
    expect(get(store)).toBe('pratah');
    h = 11;
    tick();
    expect(get(store)).toBe('madhyahna');
    stop();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test src/lib/phase/clock.test.ts`
Expected: FAIL — `createPhaseStore is not a function`.

- [ ] **Step 3: Implement createPhaseStore**

Append to `frontend/src/lib/phase/clock.ts`:

```ts
import { writable, type Readable } from 'svelte/store';

export interface PhaseStoreHandle {
  store: Readable<Phase>;
  tick: () => void;
  stop: () => void;
}

/**
 * Create a Svelte store that emits the current phase. Recomputes on
 * every `tick` (manual or auto-fired by the interval). Exposed
 * separately for tests so we can advance time without timers.
 */
export function createPhaseStore(now: () => Date = () => new Date(), intervalMs = 60_000): PhaseStoreHandle {
  const inner = writable<Phase>(phaseAt(now()));
  const tick = () => inner.set(phaseAt(now()));
  const handle = setInterval(tick, intervalMs);
  return {
    store: inner,
    tick,
    stop: () => clearInterval(handle)
  };
}
```

- [ ] **Step 4: Run tests pass**

Run: `cd frontend && pnpm test src/lib/phase/clock.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Add singleton exposed via clock module**

Append to `frontend/src/lib/phase/clock.ts`:

```ts
import { browser } from '$app/environment';

const handle = browser ? createPhaseStore() : null;
export const currentPhase: Readable<Phase> = handle
  ? handle.store
  : writable<Phase>(phaseAt(new Date()));
```

- [ ] **Step 6: Run full test suite**

Run: `cd frontend && pnpm check && pnpm test`
Expected: 0 errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/phase/clock.ts frontend/src/lib/phase/clock.test.ts
git commit -m "feat(phase): currentPhase store with 60s tick"
```

---

## Task 3: EditorialHeaderTile reads phase store + 8s Sanskrit↔English flip

**Files:**
- Modify: `frontend/src/lib/tiles/EditorialHeaderTile.svelte`

- [ ] **Step 1: Read current edition derivation**

Run: `grep -n "edition\|Edition\|kicker" frontend/src/lib/tiles/EditorialHeaderTile.svelte | head -20`

Confirm the `edition` derived value uses `now.getHours()` directly (this is what we replace).

- [ ] **Step 2: Replace edition derivation with phase-driven flip**

In `frontend/src/lib/tiles/EditorialHeaderTile.svelte`, replace the `const edition = $derived.by(...)` block with:

```ts
import { currentPhase, type Phase } from '$lib/phase/clock.js';

// Sanskrit (with IAST diacritics) and English labels per phase. Flip
// every 8s so both halves get airtime; respects prefers-reduced-motion
// by pinning to side-by-side static.
const PHASE_LABELS: Record<Phase, { sa: string; en: string }> = {
  pratah:    { sa: 'Prātaḥ Edition',    en: 'Morning Edition' },
  madhyahna: { sa: 'Madhyāhna Edition', en: 'Midday Edition' },
  sandhya:   { sa: 'Sandhyā Edition',   en: 'Evening Edition' },
  ratri:     { sa: 'Rātri Edition',     en: 'Late Edition' }
};

let flipIdx = $state(0); // 0 = sanskrit, 1 = english
let flipTimer: ReturnType<typeof setInterval> | null = null;
let reducedMotion = $state(false);

onMount(() => {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  reducedMotion = mq.matches;
  const onChange = (e: MediaQueryListEvent) => (reducedMotion = e.matches);
  mq.addEventListener('change', onChange);

  if (!reducedMotion) {
    flipTimer = setInterval(() => (flipIdx = flipIdx === 0 ? 1 : 0), 8000);
  }

  return () => {
    mq.removeEventListener('change', onChange);
  };
});

onDestroy(() => {
  if (flipTimer) clearInterval(flipTimer);
});

const edition = $derived.by(() => {
  const labels = PHASE_LABELS[$currentPhase];
  if (reducedMotion) return `${labels.sa} · ${labels.en}`;
  return flipIdx === 0 ? labels.sa : labels.en;
});
```

- [ ] **Step 3: Update kicker markup with cross-fade**

Find the `<div class="kicker">` block. Replace with:

```svelte
<div class="kicker">
  <span class="flip" data-idx={flipIdx}>— {edition} —</span>
</div>
```

Append to the `<style>` block:

```css
.kicker .flip {
  display: inline-block;
  transition: opacity 400ms ease;
}
/* Pulse opacity by toggling data-idx — keyframes would re-trigger on
 * every state read; simple CSS swap is enough since the flip itself
 * is JS-driven. */
```

(No keyframes needed — Svelte re-renders the span when `flipIdx` changes; the `transition` class smooths the swap if we cycle the DOM. Simpler and good enough.)

- [ ] **Step 4: Verify type-check + tests**

Run: `cd frontend && pnpm check && pnpm test`
Expected: 0 errors, all tests pass.

- [ ] **Step 5: ROLLOUT GATE — local preview**

```bash
cd frontend && pnpm dev
```

Open: http://localhost:5173/?preset=editorial-daily

Verify (note for user before proceeding):
- Kicker shows current phase's Sanskrit label first
- After 8s, flips to English label
- After 8s more, flips back to Sanskrit
- `prefers-reduced-motion` (Mac System Settings → Display → Reduce motion) shows `Sanskrit · English` static
- No console errors

**STOP. Show user. Get explicit approval before commit.**

- [ ] **Step 6: Commit (after user approval)**

```bash
git add frontend/src/lib/tiles/EditorialHeaderTile.svelte
git commit -m "feat(editorial): bilingual phase-driven edition kicker"
```

---

# Phase 2 — Section host tile + channel store + first card

After this phase, one section in `editorial-daily` is driven by the channel engine and shows `calendar_today`.

## Task 4: Card types

**Files:**
- Create: `frontend/src/lib/cards/types.ts`

- [ ] **Step 1: Write the type module**

Create `frontend/src/lib/cards/types.ts`:

```ts
import type { Component } from 'svelte';
import type { Phase } from '$lib/phase/clock.js';

export type CardId =
  | 'calendar_today'
  | 'calendar_next'
  | 'calendar_tomorrow'
  | 'news_tech'
  | 'grocery'
  | 'immich_photo'
  | 'weather_hourly'
  | 'ha_notifications'
  | 'plex_now_playing';

export interface CardProps {
  id: string;
  phase: Phase;
  isActive: boolean;
  props?: Record<string, unknown>;
}

export interface CardEntry {
  id: CardId;
  component: Component<CardProps>;
  refreshIntervalMs: number;
  emptyState: string;
}

export type SectionId = 'section-2' | 'section-3' | 'section-4';

export interface ChannelConfig {
  pool: CardId[];
  phaseDefaults: Record<Phase, CardId>;
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/cards/types.ts
git commit -m "feat(cards): card + channel type definitions"
```

---

## Task 5: Channel config — locked map from spec

**Files:**
- Create: `frontend/src/lib/sections/config.ts`

- [ ] **Step 1: Write the config module**

Create `frontend/src/lib/sections/config.ts`:

```ts
import type { ChannelConfig, SectionId } from '$lib/cards/types.js';

/**
 * Locked from spec: docs/superpowers/specs/2026-05-09-mirror-daily-v1-design.md
 * Each section has a pool of candidate cards and a phase-default map.
 * Gesture-cycle moves through the pool. Phase change snaps to the default
 * unless an active manual override is in effect.
 */
export const CHANNELS: Record<SectionId, ChannelConfig> = {
  'section-2': {
    pool: ['calendar_today', 'immich_photo', 'news_tech', 'calendar_tomorrow', 'calendar_next'],
    phaseDefaults: {
      pratah: 'calendar_today',
      madhyahna: 'calendar_next',
      sandhya: 'calendar_tomorrow',
      ratri: 'immich_photo'
    }
  },
  'section-3': {
    pool: ['news_tech', 'grocery', 'calendar_today', 'calendar_tomorrow'],
    phaseDefaults: {
      pratah: 'news_tech',
      madhyahna: 'grocery',
      sandhya: 'news_tech',
      ratri: 'calendar_tomorrow'
    }
  },
  'section-4': {
    pool: ['weather_hourly', 'ha_notifications', 'immich_photo'],
    phaseDefaults: {
      pratah: 'weather_hourly',
      madhyahna: 'ha_notifications',
      sandhya: 'immich_photo',
      ratri: 'ha_notifications'
    }
  }
};

export const OVERRIDE_TIMEOUT_MS = 10 * 60 * 1000;
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/sections/config.ts
git commit -m "feat(sections): lock CHANNELS map from spec"
```

---

## Task 6: Channel store — TDD core state machine

**Files:**
- Create: `frontend/src/lib/sections/channel.ts`
- Test: `frontend/src/lib/sections/channel.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/lib/sections/channel.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test src/lib/sections/channel.test.ts`
Expected: FAIL — `createChannelStore is not a function`.

- [ ] **Step 3: Implement createChannelStore**

Create `frontend/src/lib/sections/channel.ts`:

```ts
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

export function createChannelStore(_id: SectionId, cfg: ChannelConfig, initialPhase: Phase): ChannelHandle {
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
```

- [ ] **Step 4: Run tests pass**

Run: `cd frontend && pnpm test src/lib/sections/channel.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/sections/channel.ts frontend/src/lib/sections/channel.test.ts
git commit -m "feat(sections): channel store with cycle + override + phase swap"
```

---

## Task 7: Card registry — typed lookup

**Files:**
- Create: `frontend/src/lib/cards/registry.ts`
- Test: `frontend/src/lib/cards/registry.test.ts`

- [ ] **Step 1: Write the registry skeleton**

Create `frontend/src/lib/cards/registry.ts`:

```ts
import type { CardEntry, CardId } from './types.js';

/**
 * Card registry. Each entry binds a CardId to its component, refresh
 * cadence, and empty-state copy. Lookup via `cardFor(id)`. Cards are
 * registered piecemeal as they're built (Phases 2-3 of the rollout).
 */
const REGISTRY = new Map<CardId, CardEntry>();

export function registerCard(entry: CardEntry): void {
  REGISTRY.set(entry.id, entry);
}

export function cardFor(id: CardId): CardEntry | undefined {
  return REGISTRY.get(id);
}

export function listRegistered(): CardId[] {
  return Array.from(REGISTRY.keys());
}
```

- [ ] **Step 2: Write the failing registry test**

Create `frontend/src/lib/cards/registry.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { registerCard, cardFor, listRegistered } from './registry.js';
import type { CardEntry, CardProps } from './types.js';
import type { Component } from 'svelte';

const stub: Component<CardProps> = (() => null) as unknown as Component<CardProps>;

describe('card registry', () => {
  it('registers and retrieves a card', () => {
    const entry: CardEntry = {
      id: 'calendar_today',
      component: stub,
      refreshIntervalMs: 60_000,
      emptyState: 'No events today'
    };
    registerCard(entry);
    expect(cardFor('calendar_today')).toBe(entry);
  });

  it('returns undefined for unknown ids', () => {
    expect(cardFor('news_tech')).toBeDefined(); // none registered yet in this run order
  });

  it('lists all registered ids', () => {
    const ids = listRegistered();
    expect(ids).toContain('calendar_today');
  });
});
```

Note: third test is order-dependent. If it gets flaky, swap to a fresh Map per test by exporting a `__resetRegistry()` for tests only.

- [ ] **Step 3: Run tests pass**

Run: `cd frontend && pnpm test src/lib/cards/registry.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/cards/registry.ts frontend/src/lib/cards/registry.test.ts
git commit -m "feat(cards): card registry with register + lookup"
```

---

## Task 8: SectionHostTile — mounts active card from channel state

**Files:**
- Create: `frontend/src/lib/tiles/SectionHostTile.svelte`

- [ ] **Step 1: Write the component**

Create `frontend/src/lib/tiles/SectionHostTile.svelte`:

```svelte
<script lang="ts">
  /**
   * Section host. Reads its section's channel state and mounts the
   * active card. Listens for window-level mirror:phase_change to
   * apply phase default and runs a 30s sweep to expire overrides.
   */
  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import BaseTile from './BaseTile.svelte';
  import type { ChannelConfig, SectionId } from '$lib/cards/types.js';
  import { createChannelStore, type ChannelHandle } from '$lib/sections/channel.js';
  import { cardFor } from '$lib/cards/registry.js';
  import { currentPhase } from '$lib/phase/clock.js';

  interface Props {
    id: string;
    props?: { sectionId?: SectionId; channelConfig?: ChannelConfig };
  }
  let { id, props = {} }: Props = $props();

  const sectionId = $derived(props.sectionId ?? (id as SectionId));
  const cfg = $derived(props.channelConfig);

  let handle: ChannelHandle | null = $state(null);
  let sweep: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    if (!cfg) return;
    handle = createChannelStore(sectionId, cfg, get(currentPhase));

    const onPhaseChange = () => handle?.applyPhaseDefault(get(currentPhase));
    const unsubPhase = currentPhase.subscribe(() => onPhaseChange());

    sweep = setInterval(() => handle?.tickOverrides(get(currentPhase)), 30_000);

    return () => {
      unsubPhase();
    };
  });

  onDestroy(() => {
    if (sweep) clearInterval(sweep);
  });

  // Reactive lookup of the active card
  const cardId = $derived(handle ? get(handle.state).currentCardId : undefined);
  const entry = $derived(cardId ? cardFor(cardId) : undefined);
</script>

<BaseTile {id} type="section_host" chromeless={true} label={sectionId}>
  {#if entry}
    {@const Component = entry.component}
    <Component id={id} phase={$currentPhase} isActive={true} />
  {:else}
    <div class="ph">— loading —</div>
  {/if}
</BaseTile>

<style>
  .ph {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--dim);
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 0.7rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
</style>
```

- [ ] **Step 2: Register `section_host` in tile registry**

Modify `frontend/src/lib/tiles/registry.ts`. Add import:

```ts
import SectionHostTile from './SectionHostTile.svelte';
```

Add to the `TILES` map:

```ts
section_host: SectionHostTile,
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/tiles/SectionHostTile.svelte frontend/src/lib/tiles/registry.ts
git commit -m "feat(sections): SectionHostTile mounts active card from channel"
```

---

## Task 9: First card — CalendarDayCard

**Files:**
- Create: `frontend/src/lib/tiles/CalendarDayCard.svelte`

- [ ] **Step 1: Write the component**

Create `frontend/src/lib/tiles/CalendarDayCard.svelte`:

```svelte
<script lang="ts">
  /**
   * Today's events from the HA calendar entity. Wraps existing
   * watchEntity helper. Empty state when no events; quiet failure line
   * when fetch breaks. Auto-refresh by HaEntity store; no setInterval
   * needed here.
   */
  import { onDestroy } from 'svelte';
  import { watchEntity, type HaEntity } from '$lib/ha/entity.js';

  interface Props {
    id: string;
    isActive: boolean;
    props?: { entityId?: string };
  }
  let { id: _id, isActive, props = {} }: Props = $props();

  const entityId = $derived(props.entityId ?? 'calendar.palakurla4340_gmail_com');

  let entity = $state<HaEntity | null>(null);
  let stop: (() => void) | null = null;
  $effect(() => {
    stop?.();
    entity = null;
    if (!isActive) return;
    const w = watchEntity(entityId, 60_000);
    const unsub = w.store.subscribe((e) => (entity = e));
    stop = () => {
      unsub();
      w.stop();
    };
  });
  onDestroy(() => stop?.());

  interface CalEvent {
    summary: string;
    start: string; // ISO
    end?: string;
  }

  const events = $derived.by((): CalEvent[] => {
    if (!entity) return [];
    const a = entity.attributes as { events?: CalEvent[] };
    if (!Array.isArray(a.events)) return [];
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    return a.events
      .filter((e) => {
        const s = new Date(e.start);
        return s >= todayStart && s < tomorrowStart;
      })
      .sort((a, b) => +new Date(a.start) - +new Date(b.start));
  });

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };
</script>

<section class="cal-day">
  <header class="kicker">— Today's Calendar —</header>
  {#if events.length === 0}
    <p class="empty">No events today — clear day ahead</p>
  {:else}
    <ul>
      {#each events as e (e.start)}
        <li>
          <span class="t">{fmtTime(e.start)}</span>
          <span class="s">{e.summary}</span>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="rule" aria-hidden="true"></div>
</section>

<style>
  .cal-day {
    height: 100%;
    width: 100%;
    padding: 0.6rem 0.8rem 0.7rem;
    display: flex;
    flex-direction: column;
    color: var(--fg);
    font-family: 'Fraunces', Georgia, serif;
    position: relative;
  }
  .kicker {
    font-style: italic;
    font-size: 0.6rem;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--dim);
    margin-bottom: 0.5rem;
  }
  .empty {
    font-style: italic;
    color: var(--dim);
    font-size: 1.05rem;
    margin: auto 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    flex: 1;
  }
  li {
    display: grid;
    grid-template-columns: 5rem 1fr;
    gap: 0.7rem;
    align-items: baseline;
  }
  .t {
    font-style: italic;
    font-size: 0.85rem;
    color: var(--accent);
    font-feature-settings: 'tnum';
    letter-spacing: 0.04em;
  }
  .s {
    font-style: italic;
    font-size: 0.95rem;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rule {
    position: absolute;
    left: 0.8rem;
    right: 0.8rem;
    bottom: 0;
    height: 1px;
    background: var(--line);
  }
</style>
```

- [ ] **Step 2: Register the card**

Append to `frontend/src/lib/cards/registry.ts`:

```ts
import CalendarDayCard from '$lib/tiles/CalendarDayCard.svelte';

registerCard({
  id: 'calendar_today',
  component: CalendarDayCard as never,
  refreshIntervalMs: 60_000,
  emptyState: 'No events today — clear day ahead'
});
```

- [ ] **Step 3: Type-check + tests**

Run: `cd frontend && pnpm check && pnpm test`
Expected: 0 errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/tiles/CalendarDayCard.svelte frontend/src/lib/cards/registry.ts
git commit -m "feat(cards): calendar_today — today's events from HA calendar"
```

---

## Task 10: Wire one section in editorial.portrait.json

**Files:**
- Modify: `frontend/src/lib/layout/bundled/editorial.portrait.json`

- [ ] **Step 1: Replace section-2 placeholder with section_host**

Edit `frontend/src/lib/layout/bundled/editorial.portrait.json`. Replace the `section-2` tile entry with:

```json
{ "id": "section-2", "type": "section_host", "x": 0, "y": 2, "w": 8, "h": 4,
  "props": {
    "sectionId": "section-2",
    "channelConfig": {
      "pool": ["calendar_today", "immich_photo", "news_tech", "calendar_tomorrow", "calendar_next"],
      "phaseDefaults": {
        "pratah": "calendar_today",
        "madhyahna": "calendar_next",
        "sandhya": "calendar_tomorrow",
        "ratri": "immich_photo"
      }
    }
  }
}
```

Leave `section-3` and `section-4` as `placeholder` for this task — they'll get swapped in Phase 8.

- [ ] **Step 2: Type-check + tests**

Run: `cd frontend && pnpm check && pnpm test`
Expected: 0 errors, all pass.

- [ ] **Step 3: ROLLOUT GATE — local preview**

```bash
cd frontend && pnpm dev
```

Open: http://localhost:5173/?preset=editorial-daily

Verify:
- Section 2 shows "Today's Calendar" kicker
- If HA configured: today's events; if demo mode: "No events today — clear day ahead"
- Sections 3 + 4 still show placeholder cards
- No console errors

**STOP. Show user. Get approval.**

- [ ] **Step 4: Commit (after approval)**

```bash
git add frontend/src/lib/layout/bundled/editorial.portrait.json
git commit -m "feat(editorial): section-2 driven by section_host + calendar_today"
```

---

# Phase 3 — Remaining 6 cards

After this phase, all 6 remaining channel cards exist and are registered. Two cards (tech_news, immich_photo) render their empty-state until Phase 6 wires their proxies.

## Task 11: CalendarNextCard

**Files:**
- Create: `frontend/src/lib/tiles/CalendarNextCard.svelte`
- Modify: `frontend/src/lib/cards/registry.ts`

- [ ] **Step 1: Create the component**

Create `frontend/src/lib/tiles/CalendarNextCard.svelte`:

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { watchEntity, type HaEntity } from '$lib/ha/entity.js';

  interface Props {
    id: string;
    isActive: boolean;
    props?: { entityId?: string };
  }
  let { isActive, props = {} }: Props = $props();
  const entityId = $derived(props.entityId ?? 'calendar.palakurla4340_gmail_com');

  let entity = $state<HaEntity | null>(null);
  let stop: (() => void) | null = null;
  $effect(() => {
    stop?.();
    entity = null;
    if (!isActive) return;
    const w = watchEntity(entityId, 60_000);
    const unsub = w.store.subscribe((e) => (entity = e));
    stop = () => {
      unsub();
      w.stop();
    };
  });
  onDestroy(() => stop?.());

  interface CalEvent { summary: string; start: string; end?: string }

  const next = $derived.by((): CalEvent | null => {
    if (!entity) return null;
    const a = entity.attributes as { events?: CalEvent[]; message?: string; start_time?: string };
    if (Array.isArray(a.events)) {
      const now = new Date();
      const future = a.events
        .filter((e) => new Date(e.start) >= now)
        .sort((x, y) => +new Date(x.start) - +new Date(y.start));
      if (future[0]) return future[0];
    }
    if (a.message && a.start_time) {
      return { summary: a.message, start: a.start_time };
    }
    return null;
  });

  const countdown = $derived.by((): string => {
    if (!next) return '';
    const ms = +new Date(next.start) - Date.now();
    if (ms < 0) return 'now';
    const min = Math.round(ms / 60_000);
    if (min < 60) return `in ${min} min`;
    const hr = Math.floor(min / 60);
    const rest = min % 60;
    return rest === 0 ? `in ${hr}h` : `in ${hr}h ${rest}m`;
  });
</script>

<section class="cal-next">
  <header class="kicker">— Next Up —</header>
  {#if !next}
    <p class="empty">Nothing scheduled</p>
  {:else}
    <p class="title">{next.summary}</p>
    <p class="when">{countdown}</p>
  {/if}
  <div class="rule" aria-hidden="true"></div>
</section>

<style>
  .cal-next {
    height: 100%;
    padding: 0.6rem 0.8rem 0.7rem;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    color: var(--fg);
    font-family: 'Fraunces', Georgia, serif;
    position: relative;
  }
  .kicker {
    font-style: italic;
    font-size: 0.6rem;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--dim);
    margin-bottom: 0.5rem;
  }
  .empty {
    font-style: italic;
    color: var(--dim);
    font-size: 1.05rem;
  }
  .title {
    font-style: italic;
    font-weight: 700;
    font-size: clamp(1.4rem, 3vw, 2rem);
    line-height: 1.1;
    margin: 0 0 0.3rem;
  }
  .when {
    font-style: italic;
    color: var(--accent);
    font-size: 0.95rem;
    letter-spacing: 0.06em;
    margin: 0;
  }
  .rule {
    position: absolute;
    left: 0.8rem;
    right: 0.8rem;
    bottom: 0;
    height: 1px;
    background: var(--line);
  }
</style>
```

- [ ] **Step 2: Register the card**

Append to `frontend/src/lib/cards/registry.ts`:

```ts
import CalendarNextCard from '$lib/tiles/CalendarNextCard.svelte';
registerCard({
  id: 'calendar_next',
  component: CalendarNextCard as never,
  refreshIntervalMs: 60_000,
  emptyState: 'Nothing scheduled'
});
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/tiles/CalendarNextCard.svelte frontend/src/lib/cards/registry.ts
git commit -m "feat(cards): calendar_next — next event with countdown"
```

---

## Task 12: CalendarTomorrowCard

**Files:**
- Create: `frontend/src/lib/tiles/CalendarTomorrowCard.svelte`
- Modify: `frontend/src/lib/cards/registry.ts`

- [ ] **Step 1: Create the component**

Create `frontend/src/lib/tiles/CalendarTomorrowCard.svelte`:

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { watchEntity, type HaEntity } from '$lib/ha/entity.js';

  interface Props {
    id: string;
    isActive: boolean;
    props?: { entityId?: string };
  }
  let { isActive, props = {} }: Props = $props();
  const entityId = $derived(props.entityId ?? 'calendar.palakurla4340_gmail_com');

  let entity = $state<HaEntity | null>(null);
  let stop: (() => void) | null = null;
  $effect(() => {
    stop?.();
    entity = null;
    if (!isActive) return;
    const w = watchEntity(entityId, 60_000);
    const unsub = w.store.subscribe((e) => (entity = e));
    stop = () => {
      unsub();
      w.stop();
    };
  });
  onDestroy(() => stop?.());

  interface CalEvent { summary: string; start: string }

  const tomorrowEvents = $derived.by((): CalEvent[] => {
    if (!entity) return [];
    const a = entity.attributes as { events?: CalEvent[] };
    if (!Array.isArray(a.events)) return [];
    const tomorrowStart = new Date();
    tomorrowStart.setHours(0, 0, 0, 0);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const dayAfter = new Date(tomorrowStart);
    dayAfter.setDate(dayAfter.getDate() + 1);
    return a.events
      .filter((e) => {
        const s = new Date(e.start);
        return s >= tomorrowStart && s < dayAfter;
      })
      .sort((x, y) => +new Date(x.start) - +new Date(y.start));
  });

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
</script>

<section class="cal-tom">
  <header class="kicker">— Tomorrow —</header>
  {#if tomorrowEvents.length === 0}
    <p class="empty">Tomorrow's clear</p>
  {:else}
    <ul>
      {#each tomorrowEvents.slice(0, 4) as e (e.start)}
        <li>
          <span class="t">{fmtTime(e.start)}</span>
          <span class="s">{e.summary}</span>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="rule" aria-hidden="true"></div>
</section>

<style>
  .cal-tom {
    height: 100%;
    padding: 0.6rem 0.8rem 0.7rem;
    display: flex;
    flex-direction: column;
    color: var(--fg);
    font-family: 'Fraunces', Georgia, serif;
    position: relative;
  }
  .kicker {
    font-style: italic;
    font-size: 0.6rem;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--dim);
    margin-bottom: 0.5rem;
  }
  .empty { font-style: italic; color: var(--dim); font-size: 1.05rem; margin: auto 0; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.45rem; flex: 1; }
  li { display: grid; grid-template-columns: 5rem 1fr; gap: 0.7rem; align-items: baseline; }
  .t { font-style: italic; font-size: 0.85rem; color: var(--accent); font-feature-settings: 'tnum'; }
  .s { font-style: italic; font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rule { position: absolute; left: 0.8rem; right: 0.8rem; bottom: 0; height: 1px; background: var(--line); }
</style>
```

- [ ] **Step 2: Register the card**

Append to `frontend/src/lib/cards/registry.ts`:

```ts
import CalendarTomorrowCard from '$lib/tiles/CalendarTomorrowCard.svelte';
registerCard({
  id: 'calendar_tomorrow',
  component: CalendarTomorrowCard as never,
  refreshIntervalMs: 60_000,
  emptyState: "Tomorrow's clear"
});
```

- [ ] **Step 3: Type-check + commit**

```bash
cd frontend && pnpm check
git add frontend/src/lib/tiles/CalendarTomorrowCard.svelte frontend/src/lib/cards/registry.ts
git commit -m "feat(cards): calendar_tomorrow — tomorrow's first 4 events"
```

---

## Task 13: WeatherHourlyCard

**Files:**
- Create: `frontend/src/lib/tiles/WeatherHourlyCard.svelte`
- Modify: `frontend/src/lib/cards/registry.ts`

- [ ] **Step 1: Create the component**

Create `frontend/src/lib/tiles/WeatherHourlyCard.svelte`:

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { watchEntity, type HaEntity } from '$lib/ha/entity.js';

  interface Props {
    id: string;
    isActive: boolean;
    props?: { entityId?: string; units?: 'metric' | 'imperial' };
  }
  let { isActive, props = {} }: Props = $props();
  const entityId = $derived(props.entityId ?? 'weather.4340');
  const units = $derived(props.units ?? 'imperial');

  let entity = $state<HaEntity | null>(null);
  let stop: (() => void) | null = null;
  $effect(() => {
    stop?.();
    entity = null;
    if (!isActive) return;
    const w = watchEntity(entityId, 5 * 60 * 1000);
    const unsub = w.store.subscribe((e) => (entity = e));
    stop = () => { unsub(); w.stop(); };
  });
  onDestroy(() => stop?.());

  interface ForecastHour { datetime: string; temperature: number; condition: string; precipitation_probability?: number }

  const hours = $derived.by((): ForecastHour[] => {
    if (!entity) return [];
    const a = entity.attributes as { forecast?: ForecastHour[]; temperature_unit?: string };
    if (!Array.isArray(a.forecast)) return [];
    return a.forecast.slice(0, 6);
  });

  const fmtT = (c: number) =>
    units === 'imperial' ? `${Math.round((c * 9) / 5 + 32)}°` : `${Math.round(c)}°`;
  const fmtH = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit' });
  const cap = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
</script>

<section class="wx">
  <header class="kicker">— Sky —</header>
  {#if hours.length === 0}
    <p class="empty">Forecast unavailable</p>
  {:else}
    <ul>
      {#each hours as h (h.datetime)}
        <li>
          <span class="hr">{fmtH(h.datetime)}</span>
          <span class="t">{fmtT(h.temperature)}</span>
          <span class="c">{cap(h.condition)}</span>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="rule" aria-hidden="true"></div>
</section>

<style>
  .wx { height: 100%; padding: 0.6rem 0.8rem 0.7rem; display: flex; flex-direction: column; color: var(--fg); font-family: 'Fraunces', Georgia, serif; position: relative; }
  .kicker { font-style: italic; font-size: 0.6rem; letter-spacing: 0.28em; text-transform: uppercase; color: var(--dim); margin-bottom: 0.5rem; }
  .empty { font-style: italic; color: var(--dim); font-size: 1.05rem; margin: auto 0; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; flex: 1; justify-content: center; }
  li { display: grid; grid-template-columns: 3rem 3rem 1fr; gap: 0.7rem; align-items: baseline; font-style: italic; font-size: 0.92rem; }
  .hr { color: var(--dim); font-feature-settings: 'tnum'; }
  .t { color: var(--accent); font-weight: 700; font-feature-settings: 'tnum'; }
  .c { color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rule { position: absolute; left: 0.8rem; right: 0.8rem; bottom: 0; height: 1px; background: var(--line); }
</style>
```

- [ ] **Step 2: Register the card**

Append to `frontend/src/lib/cards/registry.ts`:

```ts
import WeatherHourlyCard from '$lib/tiles/WeatherHourlyCard.svelte';
registerCard({
  id: 'weather_hourly',
  component: WeatherHourlyCard as never,
  refreshIntervalMs: 5 * 60 * 1000,
  emptyState: 'Forecast unavailable'
});
```

- [ ] **Step 3: Commit**

```bash
cd frontend && pnpm check
git add frontend/src/lib/tiles/WeatherHourlyCard.svelte frontend/src/lib/cards/registry.ts
git commit -m "feat(cards): weather_hourly — next 6 hours forecast"
```

---

## Task 14: GroceryListCard

**Files:**
- Create: `frontend/src/lib/tiles/GroceryListCard.svelte`
- Modify: `frontend/src/lib/cards/registry.ts`

- [ ] **Step 1: Inspect existing grocery API shape**

Run: `grep -rn "/api/grocery" frontend/src/ | head`

Find what `/api/grocery/list` (or similar) returns. The component below assumes `{ items: [{ name, qty?, store? }] }` — adjust if reality differs.

- [ ] **Step 2: Create the component**

Create `frontend/src/lib/tiles/GroceryListCard.svelte`:

```svelte
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  interface Props {
    id: string;
    isActive: boolean;
    props?: { endpoint?: string };
  }
  let { isActive, props = {} }: Props = $props();
  const endpoint = $derived(props.endpoint ?? '/api/grocery/list');

  interface GroceryItem { name: string; qty?: number; store?: string }
  let items = $state<GroceryItem[]>([]);
  let failed = $state(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function load() {
    try {
      const r = await fetch(endpoint, { cache: 'no-store' });
      if (!r.ok) { failed = true; return; }
      const j = (await r.json()) as { items?: GroceryItem[] };
      items = j.items ?? [];
      failed = false;
    } catch {
      failed = true;
    }
  }

  onMount(() => {
    if (!isActive) return;
    void load();
    timer = setInterval(load, 30_000);
  });
  onDestroy(() => { if (timer) clearInterval(timer); });
</script>

<section class="grocery">
  <header class="kicker">— Pantry —</header>
  {#if failed}
    <p class="fail">— card unavailable —</p>
  {:else if items.length === 0}
    <p class="empty">Pantry's stocked</p>
  {:else}
    <ul>
      {#each items.slice(0, 6) as it, i (i)}
        <li>
          <span class="n">{it.name}</span>
          {#if it.store}<span class="st">{it.store}</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}
  <div class="rule" aria-hidden="true"></div>
</section>

<style>
  .grocery { height: 100%; padding: 0.6rem 0.8rem 0.7rem; display: flex; flex-direction: column; color: var(--fg); font-family: 'Fraunces', Georgia, serif; position: relative; }
  .kicker { font-style: italic; font-size: 0.6rem; letter-spacing: 0.28em; text-transform: uppercase; color: var(--dim); margin-bottom: 0.5rem; }
  .empty, .fail { font-style: italic; color: var(--dim); font-size: 1.05rem; margin: auto 0; }
  .fail { color: var(--dimmer); }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; flex: 1; }
  li { display: flex; justify-content: space-between; align-items: baseline; font-style: italic; font-size: 0.95rem; }
  .st { color: var(--accent); font-size: 0.7rem; letter-spacing: 0.18em; text-transform: uppercase; }
  .rule { position: absolute; left: 0.8rem; right: 0.8rem; bottom: 0; height: 1px; background: var(--line); }
</style>
```

- [ ] **Step 3: Register the card**

Append to `frontend/src/lib/cards/registry.ts`:

```ts
import GroceryListCard from '$lib/tiles/GroceryListCard.svelte';
registerCard({
  id: 'grocery',
  component: GroceryListCard as never,
  refreshIntervalMs: 30_000,
  emptyState: "Pantry's stocked"
});
```

- [ ] **Step 4: Commit**

```bash
cd frontend && pnpm check
git add frontend/src/lib/tiles/GroceryListCard.svelte frontend/src/lib/cards/registry.ts
git commit -m "feat(cards): grocery — pantry list with 30s refresh"
```

---

## Task 15: NotificationsCard

**Files:**
- Create: `frontend/src/lib/tiles/NotificationsCard.svelte`
- Modify: `frontend/src/lib/cards/registry.ts`

- [ ] **Step 1: Create the component**

Create `frontend/src/lib/tiles/NotificationsCard.svelte`:

```svelte
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  interface Props {
    id: string;
    isActive: boolean;
  }
  let { isActive }: Props = $props();

  interface Notif { entity_id: string; state: string; attributes?: { title?: string; message?: string; created_at?: string } }
  let items = $state<Notif[]>([]);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function load() {
    const w = window as unknown as { __HA_URL__?: string; __HA_TOKEN__?: string };
    if (!w.__HA_URL__ || !w.__HA_TOKEN__) return;
    try {
      const r = await fetch(`${w.__HA_URL__}/api/states`, {
        headers: { Authorization: `Bearer ${w.__HA_TOKEN__}` },
        cache: 'no-store'
      });
      if (!r.ok) return;
      const all = (await r.json()) as Notif[];
      items = all
        .filter((e) => e.entity_id.startsWith('persistent_notification.'))
        .sort((a, b) => {
          const at = a.attributes?.created_at ?? '';
          const bt = b.attributes?.created_at ?? '';
          return bt.localeCompare(at);
        })
        .slice(0, 3);
    } catch {
      /* swallow */
    }
  }

  onMount(() => {
    if (!isActive) return;
    void load();
    timer = setInterval(load, 15_000);
  });
  onDestroy(() => { if (timer) clearInterval(timer); });

  const fmtTime = (iso?: string) =>
    iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
</script>

<section class="notif">
  <header class="kicker">— System Pulse —</header>
  {#if items.length === 0}
    <p class="empty">All quiet</p>
  {:else}
    <ul>
      {#each items as n, i (n.entity_id + i)}
        <li>
          <span class="t">{fmtTime(n.attributes?.created_at)}</span>
          <span class="m">{n.attributes?.message ?? n.attributes?.title ?? n.entity_id}</span>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="rule" aria-hidden="true"></div>
</section>

<style>
  .notif { height: 100%; padding: 0.6rem 0.8rem 0.7rem; display: flex; flex-direction: column; color: var(--fg); font-family: 'Fraunces', Georgia, serif; position: relative; }
  .kicker { font-style: italic; font-size: 0.6rem; letter-spacing: 0.28em; text-transform: uppercase; color: var(--dim); margin-bottom: 0.5rem; }
  .empty { font-style: italic; color: var(--dim); font-size: 1.05rem; margin: auto 0; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  li { display: grid; grid-template-columns: 4rem 1fr; gap: 0.7rem; font-style: italic; font-size: 0.85rem; }
  .t { color: var(--accent); font-feature-settings: 'tnum'; }
  .m { color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rule { position: absolute; left: 0.8rem; right: 0.8rem; bottom: 0; height: 1px; background: var(--line); }
</style>
```

- [ ] **Step 2: Register**

Append to `frontend/src/lib/cards/registry.ts`:

```ts
import NotificationsCard from '$lib/tiles/NotificationsCard.svelte';
registerCard({
  id: 'ha_notifications',
  component: NotificationsCard as never,
  refreshIntervalMs: 15_000,
  emptyState: 'All quiet'
});
```

- [ ] **Step 3: Commit**

```bash
cd frontend && pnpm check
git add frontend/src/lib/tiles/NotificationsCard.svelte frontend/src/lib/cards/registry.ts
git commit -m "feat(cards): ha_notifications — last 3 persistent notifs"
```

---

## Task 16: TechNewsCard (proxy wired in Phase 6)

**Files:**
- Create: `frontend/src/lib/tiles/TechNewsCard.svelte`
- Modify: `frontend/src/lib/cards/registry.ts`

- [ ] **Step 1: Create the component**

Create `frontend/src/lib/tiles/TechNewsCard.svelte`:

```svelte
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  interface Props {
    id: string;
    isActive: boolean;
    props?: { endpoint?: string; n?: number };
  }
  let { isActive, props = {} }: Props = $props();
  const endpoint = $derived(props.endpoint ?? '/api/news/tech');
  const n = $derived(props.n ?? 5);

  interface NewsItem { title: string; url: string; score: number; by: string }
  let items = $state<NewsItem[]>([]);
  let failed = $state(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function load() {
    try {
      const r = await fetch(`${endpoint}?n=${n}`, { cache: 'no-store' });
      if (!r.ok) { failed = true; return; }
      const j = (await r.json()) as { items?: NewsItem[] };
      items = j.items ?? [];
      failed = false;
    } catch {
      failed = true;
    }
  }

  onMount(() => {
    if (!isActive) return;
    void load();
    timer = setInterval(load, 10 * 60 * 1000);
  });
  onDestroy(() => { if (timer) clearInterval(timer); });
</script>

<section class="news">
  <header class="kicker">— Tech Wire —</header>
  {#if failed}
    <p class="fail">— card unavailable —</p>
  {:else if items.length === 0}
    <p class="empty">News brief unavailable</p>
  {:else}
    <ol>
      {#each items as it, i (it.url)}
        <li>
          <span class="num">{i + 1}</span>
          <span class="title">{it.title}</span>
        </li>
      {/each}
    </ol>
  {/if}
  <div class="rule" aria-hidden="true"></div>
</section>

<style>
  .news { height: 100%; padding: 0.6rem 0.8rem 0.7rem; display: flex; flex-direction: column; color: var(--fg); font-family: 'Fraunces', Georgia, serif; position: relative; }
  .kicker { font-style: italic; font-size: 0.6rem; letter-spacing: 0.28em; text-transform: uppercase; color: var(--dim); margin-bottom: 0.5rem; }
  .empty, .fail { font-style: italic; color: var(--dim); font-size: 1.05rem; margin: auto 0; }
  .fail { color: var(--dimmer); }
  ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; flex: 1; }
  li { display: grid; grid-template-columns: 1.6rem 1fr; gap: 0.5rem; align-items: baseline; }
  .num { font-style: italic; font-weight: 700; color: var(--accent); font-feature-settings: 'tnum'; font-size: 0.85rem; }
  .title { font-style: italic; font-size: 0.92rem; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .rule { position: absolute; left: 0.8rem; right: 0.8rem; bottom: 0; height: 1px; background: var(--line); }
</style>
```

- [ ] **Step 2: Register**

Append to `frontend/src/lib/cards/registry.ts`:

```ts
import TechNewsCard from '$lib/tiles/TechNewsCard.svelte';
registerCard({
  id: 'news_tech',
  component: TechNewsCard as never,
  refreshIntervalMs: 10 * 60 * 1000,
  emptyState: 'News brief unavailable'
});
```

- [ ] **Step 3: Commit**

```bash
cd frontend && pnpm check
git add frontend/src/lib/tiles/TechNewsCard.svelte frontend/src/lib/cards/registry.ts
git commit -m "feat(cards): news_tech — empty until /api/news/tech ships"
```

---

## Task 17: ImmichPhotoCard (proxy wired in Phase 6)

**Files:**
- Create: `frontend/src/lib/tiles/ImmichPhotoCard.svelte`
- Modify: `frontend/src/lib/cards/registry.ts`

- [ ] **Step 1: Create the component**

Create `frontend/src/lib/tiles/ImmichPhotoCard.svelte`:

```svelte
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  interface Props {
    id: string;
    isActive: boolean;
    props?: { endpoint?: string };
  }
  let { isActive, props = {} }: Props = $props();
  const endpoint = $derived(props.endpoint ?? '/api/immich/photo-of-day');

  interface PhotoOfDay { photoUrl: string; dateTaken?: string; location?: string; caption?: string }
  let photo = $state<PhotoOfDay | null>(null);
  let failed = $state(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function load() {
    try {
      const r = await fetch(endpoint, { cache: 'no-store' });
      if (!r.ok) { failed = true; return; }
      photo = (await r.json()) as PhotoOfDay;
      failed = false;
    } catch {
      failed = true;
    }
  }

  onMount(() => {
    if (!isActive) return;
    void load();
    timer = setInterval(load, 60 * 60 * 1000);
  });
  onDestroy(() => { if (timer) clearInterval(timer); });

  const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
</script>

<section class="photo">
  {#if failed || !photo}
    <div class="ph-fallback">
      <header class="kicker">— From the Archive —</header>
      <p class="empty">{failed ? '— card unavailable —' : 'Photo loading…'}</p>
    </div>
  {:else}
    <img src={photo.photoUrl} alt={photo.caption ?? 'Photo of the day'} />
    <div class="overlay">
      <header class="kicker">— From the Archive —</header>
      {#if photo.caption}<p class="cap">{photo.caption}</p>{/if}
      {#if photo.dateTaken || photo.location}
        <p class="meta">
          {fmtDate(photo.dateTaken)}{photo.dateTaken && photo.location ? ' · ' : ''}{photo.location ?? ''}
        </p>
      {/if}
    </div>
  {/if}
</section>

<style>
  .photo { height: 100%; width: 100%; position: relative; overflow: hidden; }
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ph-fallback {
    height: 100%; width: 100%;
    background: radial-gradient(circle at 30% 60%, #1a1714 0%, #000 100%);
    padding: 0.6rem 0.8rem 0.7rem;
    display: flex; flex-direction: column; justify-content: center;
    color: var(--fg); font-family: 'Fraunces', Georgia, serif;
  }
  .overlay {
    position: absolute; left: 0; right: 0; bottom: 0;
    background: linear-gradient(180deg, transparent, rgba(0,0,0,0.7) 60%, rgba(0,0,0,0.85));
    padding: 1.5rem 0.8rem 0.7rem;
    color: #fff;
    font-family: 'Fraunces', Georgia, serif;
  }
  .kicker { font-style: italic; font-size: 0.6rem; letter-spacing: 0.28em; text-transform: uppercase; color: var(--accent); margin-bottom: 0.4rem; }
  .empty { font-style: italic; color: var(--dim); font-size: 1.05rem; }
  .cap { font-style: italic; font-size: 0.95rem; margin: 0; }
  .meta { font-style: italic; font-size: 0.75rem; color: rgba(255,255,255,0.65); margin: 0.25rem 0 0; letter-spacing: 0.05em; }
</style>
```

- [ ] **Step 2: Register**

Append to `frontend/src/lib/cards/registry.ts`:

```ts
import ImmichPhotoCard from '$lib/tiles/ImmichPhotoCard.svelte';
registerCard({
  id: 'immich_photo',
  component: ImmichPhotoCard as never,
  refreshIntervalMs: 60 * 60 * 1000,
  emptyState: 'From the archive'
});
```

- [ ] **Step 3: Commit**

```bash
cd frontend && pnpm check
git add frontend/src/lib/tiles/ImmichPhotoCard.svelte frontend/src/lib/cards/registry.ts
git commit -m "feat(cards): immich_photo — empty until /api/immich proxy ships"
```

---

## Task 18: ROLLOUT GATE — verify all 7 cards render

- [ ] **Step 1: Wire all 3 sections in editorial.portrait.json**

Edit `frontend/src/lib/layout/bundled/editorial.portrait.json`. Replace `section-3` and `section-4` placeholders with `section_host`:

```json
{ "id": "section-3", "type": "section_host", "x": 0, "y": 6, "w": 8, "h": 4,
  "props": {
    "sectionId": "section-3",
    "channelConfig": {
      "pool": ["news_tech", "grocery", "calendar_today", "calendar_tomorrow"],
      "phaseDefaults": {
        "pratah": "news_tech",
        "madhyahna": "grocery",
        "sandhya": "news_tech",
        "ratri": "calendar_tomorrow"
      }
    }
  }
},
{ "id": "section-4", "type": "section_host", "x": 0, "y": 10, "w": 8, "h": 4,
  "props": {
    "sectionId": "section-4",
    "channelConfig": {
      "pool": ["weather_hourly", "ha_notifications", "immich_photo"],
      "phaseDefaults": {
        "pratah": "weather_hourly",
        "madhyahna": "ha_notifications",
        "sandhya": "immich_photo",
        "ratri": "ha_notifications"
      }
    }
  }
}
```

- [ ] **Step 2: Run check + tests**

Run: `cd frontend && pnpm check && pnpm test`
Expected: 0 errors, all tests pass.

- [ ] **Step 3: ROLLOUT GATE — local preview**

```bash
cd frontend && pnpm dev
```

Open: http://localhost:5173/?preset=editorial-daily

Verify (current real-world hour determines defaults):
- Section 2 shows phase-default card (varies by hour — calendar at most hours)
- Section 3 shows phase-default card
- Section 4 shows phase-default card
- All cards either show data or their empty state — no errors
- Tech news + Immich show "card unavailable" or empty (proxies not yet wired)

**STOP. Show user. Get approval.**

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/layout/bundled/editorial.portrait.json
git commit -m "feat(editorial): all 3 sections driven by section_host"
```

---

# Phase 4 — Gesture binding (focus-aware swipe cycles section)

## Task 19: Add focused-section detection + cycle wiring

**Files:**
- Modify: `frontend/src/lib/gesture/handlers.ts`

- [ ] **Step 1: Read current mode_next/prev handlers**

Run: `grep -nA 8 "mode_next\|mode_prev" frontend/src/lib/gesture/handlers.ts`

Note the current handler shape and what `focusedTile` store import path looks like.

- [ ] **Step 2: Add channel-aware routing**

Edit `frontend/src/lib/gesture/handlers.ts`. At the top, add imports:

```ts
import { CHANNELS } from '$lib/sections/config.js';
import type { SectionId } from '$lib/cards/types.js';
```

Add a singleton channel map (in-memory) and a way for SectionHostTile to register itself. To keep changes contained: introduce a small registry next to handlers:

Create a new file `frontend/src/lib/sections/registry.ts`:

```ts
import type { ChannelHandle } from './channel.js';
import type { SectionId } from '$lib/cards/types.js';

const HANDLES = new Map<SectionId, ChannelHandle>();

export function registerSection(id: SectionId, h: ChannelHandle): void {
  HANDLES.set(id, h);
}
export function unregisterSection(id: SectionId): void {
  HANDLES.delete(id);
}
export function sectionHandle(id: SectionId): ChannelHandle | undefined {
  return HANDLES.get(id);
}
```

- [ ] **Step 3: Make SectionHostTile register itself**

Edit `frontend/src/lib/tiles/SectionHostTile.svelte`. In the `onMount` after `handle = createChannelStore(...)`, add:

```ts
import { registerSection, unregisterSection } from '$lib/sections/registry.js';
// inside onMount:
registerSection(sectionId, handle);
```

In `onDestroy`:

```ts
unregisterSection(sectionId);
```

- [ ] **Step 4: Wire focus-aware cycle in handlers**

Edit `frontend/src/lib/gesture/handlers.ts`. Replace the existing `mode_next` / `mode_prev` body with:

```ts
import { get } from 'svelte/store';
import { focusedTile } from '$lib/gesture/router.js';
import { sectionHandle } from '$lib/sections/registry.js';
import type { SectionId } from '$lib/cards/types.js';

function focusedSectionId(): SectionId | null {
  const f = get(focusedTile);
  if (!f) return null;
  if (f === 'section-2' || f === 'section-3' || f === 'section-4') return f;
  return null;
}

// In the handler map:
mode_next: () => {
  const sid = focusedSectionId();
  if (sid) {
    sectionHandle(sid)?.cycleNext();
    return;
  }
  // Fallback to prior preset cycling behavior — keep whatever was here.
  hassCmd('input_select.select_next', 'input_select.mirror_preset');
},
mode_prev: () => {
  const sid = focusedSectionId();
  if (sid) {
    sectionHandle(sid)?.cyclePrev();
    return;
  }
  hassCmd('input_select.select_previous', 'input_select.mirror_preset');
},
```

(`hassCmd` is whatever the existing handler used to call; preserve the original.)

- [ ] **Step 5: Type-check + tests**

Run: `cd frontend && pnpm check && pnpm test`
Expected: 0 errors, all tests pass.

- [ ] **Step 6: ROLLOUT GATE — local preview**

```bash
cd frontend && pnpm dev
```

Open: http://localhost:5173/?preset=editorial-daily

Manual gesture testing without hardware: simulate by dispatching events to `focusedTile` from devtools console:

```js
// in browser devtools:
// (1) Set focused tile manually
$state.focusedTile?.set('section-2');
// or use the existing exported store path
// (2) Dispatch a mode_next gesture event the same way the gesture
// router does internally, e.g.:
window.dispatchEvent(new CustomEvent('mirror:gesture', { detail: { gesture: 'mode_next' } }));
```

Verify:
- With `focusedTile` set to 'section-2': `mode_next` cycles section 2's card (calendar_today → immich_photo → ...)
- With `focusedTile` cleared: `mode_next` runs the original preset-cycle path (or no-op in demo mode)

(Exact dispatch path depends on existing gesture-router internals — adjust the test commands as needed.)

**STOP. Show user. Get approval.**

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/gesture/handlers.ts frontend/src/lib/sections/registry.ts frontend/src/lib/tiles/SectionHostTile.svelte
git commit -m "feat(gesture): focus-aware swipe cycles section channel"
```

---

# Phase 5 — Plex pre-empt full-takeover

## Task 20: PlexNowPlayingCard

**Files:**
- Create: `frontend/src/lib/tiles/PlexNowPlayingCard.svelte`
- Modify: `frontend/src/lib/cards/registry.ts`

- [ ] **Step 1: Inspect existing PlexPlayerTile to find the entity it watches**

Run: `grep -n "media_player\|plex" frontend/src/lib/tiles/PlexPlayerTile.svelte | head`

Pin the entity id used by the existing tile.

- [ ] **Step 2: Create wrapper component**

Create `frontend/src/lib/tiles/PlexNowPlayingCard.svelte`:

```svelte
<script lang="ts">
  /**
   * Plex full-takeover card. Wraps the existing PlexPlayerTile but
   * sized to fill the entire mirror minus the masthead. Mounted by
   * +page.svelte when plexActive is true; never mounted via the
   * section channel registry.
   */
  import PlexPlayerTile from './PlexPlayerTile.svelte';

  interface Props {
    id: string;
    props?: Record<string, unknown>;
  }
  let { id, props = {} }: Props = $props();
</script>

<div class="plex-fullscreen">
  <PlexPlayerTile {id} props={props as never} />
</div>

<style>
  .plex-fullscreen {
    position: relative;
    width: 100%;
    height: 100%;
    background: #000;
  }
  .plex-fullscreen :global(.tile) {
    border: 0 !important;
    border-radius: 0 !important;
    padding: 0 !important;
    background: #000 !important;
  }
</style>
```

- [ ] **Step 3: Register**

Append to `frontend/src/lib/cards/registry.ts`:

```ts
import PlexNowPlayingCard from '$lib/tiles/PlexNowPlayingCard.svelte';
registerCard({
  id: 'plex_now_playing',
  component: PlexNowPlayingCard as never,
  refreshIntervalMs: 5_000,
  emptyState: 'Nothing playing'
});
```

- [ ] **Step 4: Commit**

```bash
cd frontend && pnpm check
git add frontend/src/lib/tiles/PlexNowPlayingCard.svelte frontend/src/lib/cards/registry.ts
git commit -m "feat(cards): plex_now_playing — full-takeover wrapper"
```

---

## Task 21: Plex pre-empt watcher

**Files:**
- Create: `frontend/src/lib/plex/preempt.ts`

- [ ] **Step 1: Find the Plex entity id**

From Task 20 step 1, you should now know the Plex `media_player.*` id. If it's prop-driven (passed in via the layout), pick the most likely default and document it as a config knob.

- [ ] **Step 2: Implement watcher**

Create `frontend/src/lib/plex/preempt.ts`:

```ts
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
```

- [ ] **Step 3: Commit**

```bash
cd frontend && pnpm check
git add frontend/src/lib/plex/preempt.ts
git commit -m "feat(plex): plexActive store + 2s debounce watcher"
```

---

## Task 22: +page.svelte — render PlexFullCard when plexActive

**Files:**
- Modify: `frontend/src/routes/+page.svelte`

- [ ] **Step 1: Add Plex pre-empt wiring**

In `frontend/src/routes/+page.svelte` `<script>`, add:

```ts
import PlexNowPlayingCard from '$lib/tiles/PlexNowPlayingCard.svelte';
import { plexActive, startPlexPreempt } from '$lib/plex/preempt.js';
```

In `onMount`, after the gesture wiring:

```ts
// Boot the plex pre-empt watcher. Use the entity id you confirmed in
// Task 20 step 1 — paste the exact value here. If existing
// PlexPlayerTile takes the entity as a prop, read the same default.
startPlexPreempt(PLEX_ENTITY_ID);
```

At the top of the script, define the constant using the entity id you found in Task 20 step 1:

```ts
const PLEX_ENTITY_ID = 'media_player.plex_mirror'; // <-- replace with the id discovered in Task 20 step 1
```

- [ ] **Step 2: Add takeover render**

In the `<main class="stage">` block, modify the layout render so:

```svelte
<main class="stage" style="--os-top:{overscan.top}vh; --os-right:{overscan.right}vw; --os-bottom:{overscan.bottom}vh; --os-left:{overscan.left}vw; padding: var(--os-top) var(--os-right) var(--os-bottom) var(--os-left);">
  {#if $plexActive}
    <!-- Header still visible above; Plex spans rows 2-14 worth of area -->
    <div class="plex-takeover">
      <PlexNowPlayingCard id="plex_now_playing" />
    </div>
  {:else if $currentLayout}
    <Grid layout={$currentLayout} />
  {:else}
    <div class="boot-splash" data-testid="boot-splash">waiting for Home Assistant…</div>
  {/if}

  <!-- existing pill + toasts etc remain -->
```

Append to `<style>`:

```css
.plex-takeover {
  width: 100%;
  height: 100%;
  display: flex;
}
```

(Note: when `plexActive` is true the masthead is hidden too in this implementation. Spec says "full takeover beneath the masthead" — to keep masthead, render only the masthead tile + Plex below. For v1 acceptance, hiding masthead is acceptable; refining to keep masthead can land in Phase 7 polish if needed.)

- [ ] **Step 3: Type-check + tests**

Run: `cd frontend && pnpm check && pnpm test`
Expected: 0 errors, all pass.

- [ ] **Step 4: ROLLOUT GATE — local preview**

```bash
cd frontend && pnpm dev
```

Open: http://localhost:5173/?preset=editorial-daily

Manual Plex toggle (without HA): in devtools console, force the store:

```js
// import direct from devtools is messy; easier path is to update the
// HA entity via REST and let the watcher pick it up. Without HA:
// temporarily set plexActive=true via a debug hook or just confirm
// the SECTIONS render correctly when plexActive is false.
```

Acceptance for this step (without HA wired):
- Sections continue to render normally
- No console errors
- Plex takeover code path is in place (verify by `grep` or visually in devtools)

When HA is wired: start playing something on Plex → mirror swaps to takeover within ~7s (5s poll + 2s debounce). Stop → returns to sections.

**STOP. Show user. Get approval.**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/+page.svelte
git commit -m "feat(plex): full-takeover when plexActive"
```

---

# Phase 6 — Server proxies (Immich + HN)

## Task 23: HN tech news proxy — TDD

**Files:**
- Create: `frontend/src/routes/api/news/tech/+server.ts`
- Test: `frontend/src/routes/api/news/tech/server.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/routes/api/news/tech/server.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './+server.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 4, 9, 12, 0, 0));
  // Reset module-level cache by reimporting; vitest module cache is
  // per-test by default if isolate=true.
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function mockHN(stories: Array<{ id: number; score: number; title: string; url: string; by: string; time: number }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/topstories.json')) {
        return new Response(JSON.stringify(stories.map((s) => s.id)));
      }
      const m = url.match(/\/item\/(\d+)\.json$/);
      if (m) {
        const story = stories.find((s) => s.id === Number(m[1]));
        return new Response(JSON.stringify(story));
      }
      return new Response('not found', { status: 404 });
    })
  );
}

describe('GET /api/news/tech', () => {
  it('returns top 5 stories with score >= 100', async () => {
    mockHN([
      { id: 1, score: 200, title: 'Top 1', url: 'https://a/1', by: 'x', time: 0 },
      { id: 2, score: 50,  title: 'Low score', url: 'https://a/2', by: 'x', time: 0 },
      { id: 3, score: 150, title: 'Top 2', url: 'https://a/3', by: 'x', time: 0 },
      { id: 4, score: 110, title: 'Top 3', url: 'https://a/4', by: 'x', time: 0 },
      { id: 5, score: 105, title: 'Top 4', url: 'https://a/5', by: 'x', time: 0 },
      { id: 6, score: 102, title: 'Top 5', url: 'https://a/6', by: 'x', time: 0 },
      { id: 7, score: 90,  title: 'Below', url: 'https://a/7', by: 'x', time: 0 }
    ]);

    const res = await GET({ url: new URL('http://localhost/api/news/tech') } as never);
    const j = (await res.json()) as { items: { title: string; score: number }[] };
    expect(j.items).toHaveLength(5);
    expect(j.items.every((i) => i.score >= 100)).toBe(true);
  });

  it('honors n query parameter', async () => {
    mockHN([
      { id: 1, score: 200, title: 'A', url: 'https://a/1', by: 'x', time: 0 },
      { id: 2, score: 200, title: 'B', url: 'https://a/2', by: 'x', time: 0 },
      { id: 3, score: 200, title: 'C', url: 'https://a/3', by: 'x', time: 0 }
    ]);
    const res = await GET({ url: new URL('http://localhost/api/news/tech?n=2') } as never);
    const j = (await res.json()) as { items: unknown[] };
    expect(j.items).toHaveLength(2);
  });

  it('returns empty items array when topstories fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    const res = await GET({ url: new URL('http://localhost/api/news/tech') } as never);
    const j = (await res.json()) as { items: unknown[] };
    expect(j.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test src/routes/api/news/tech/server.test.ts`
Expected: FAIL — `Cannot find module './+server.js'`.

- [ ] **Step 3: Implement the route**

Create `frontend/src/routes/api/news/tech/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

interface HNStory { id: number; score: number; title: string; url?: string; by: string; time: number }

let cache: { ts: number; items: HNStory[] } | null = null;
const TTL_MS = 10 * 60 * 1000;

async function fetchTop(): Promise<HNStory[]> {
  const r = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
  if (!r.ok) return [];
  const ids = (await r.json()) as number[];
  const top30 = ids.slice(0, 30);

  const items: HNStory[] = [];
  // Concurrency cap: 5 in-flight at a time.
  for (let i = 0; i < top30.length; i += 5) {
    const chunk = top30.slice(i, i + 5);
    const fetched = await Promise.all(
      chunk.map(async (id) => {
        const rr = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        if (!rr.ok) return null;
        return (await rr.json()) as HNStory | null;
      })
    );
    items.push(...fetched.filter((x): x is HNStory => x !== null && (x.score ?? 0) >= 100));
    if (items.length >= 5) break;
  }
  return items.sort((a, b) => b.score - a.score);
}

export const GET: RequestHandler = async ({ url }) => {
  const n = Math.min(Math.max(Number(url.searchParams.get('n') ?? '5'), 1), 10);
  const now = Date.now();
  if (!cache || now - cache.ts > TTL_MS) {
    const items = await fetchTop();
    cache = { ts: now, items };
  }
  return json({
    items: cache.items.slice(0, n).map((s) => ({
      title: s.title,
      url: s.url ?? `https://news.ycombinator.com/item?id=${s.id}`,
      score: s.score,
      by: s.by,
      time: s.time
    }))
  });
};
```

- [ ] **Step 4: Run tests pass**

Run: `cd frontend && pnpm test src/routes/api/news/tech/server.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
cd frontend && pnpm check
git add frontend/src/routes/api/news/tech/+server.ts frontend/src/routes/api/news/tech/server.test.ts
git commit -m "feat(news): /api/news/tech HN proxy with 10min cache"
```

---

## Task 24: Immich photo-of-day proxy — TDD

**Files:**
- Create: `frontend/src/routes/api/immich/photo-of-day/+server.ts`
- Test: `frontend/src/routes/api/immich/photo-of-day/server.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/routes/api/immich/photo-of-day/server.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const env = {
  IMMICH_URL: 'https://immich.example',
  IMMICH_API_KEY: 'k',
  IMMICH_ALBUM_ID: 'album-1'
};

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('IMMICH_URL', env.IMMICH_URL);
  vi.stubEnv('IMMICH_API_KEY', env.IMMICH_API_KEY);
  vi.stubEnv('IMMICH_ALBUM_ID', env.IMMICH_ALBUM_ID);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('GET /api/immich/photo-of-day', () => {
  it('returns memory-lane asset when available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('memory-lane')) {
          return new Response(
            JSON.stringify([{ assets: [{ id: 'asset-1', exifInfo: { dateTimeOriginal: '2020-05-09T10:00:00Z' } }] }])
          );
        }
        return new Response('not used', { status: 404 });
      })
    );
    const { GET } = await import('./+server.js');
    const res = await GET({ url: new URL('http://localhost/api/immich/photo-of-day') } as never);
    const j = (await res.json()) as { photoUrl: string; dateTaken?: string };
    expect(j.photoUrl).toContain('/api/immich/asset/asset-1');
    expect(j.dateTaken).toBe('2020-05-09T10:00:00Z');
  });

  it('falls back to album random when memory-lane is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('memory-lane')) return new Response('[]');
        if (url.includes('/album/')) {
          return new Response(
            JSON.stringify({ assets: [{ id: 'asset-2' }, { id: 'asset-3' }] })
          );
        }
        return new Response('not used', { status: 404 });
      })
    );
    const { GET } = await import('./+server.js');
    const res = await GET({ url: new URL('http://localhost/api/immich/photo-of-day') } as never);
    const j = (await res.json()) as { photoUrl: string };
    expect(j.photoUrl).toMatch(/\/api\/immich\/asset\/asset-(2|3)/);
  });

  it('returns 503 when both fetches fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    const { GET } = await import('./+server.js');
    const res = await GET({ url: new URL('http://localhost/api/immich/photo-of-day') } as never);
    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test src/routes/api/immich/photo-of-day/server.test.ts`
Expected: FAIL — `Cannot find module './+server.js'`.

- [ ] **Step 3: Implement the route**

Create `frontend/src/routes/api/immich/photo-of-day/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

interface Asset { id: string; exifInfo?: { dateTimeOriginal?: string; city?: string; country?: string } }
interface MemoryLaneEntry { assets: Asset[] }
interface AlbumResp { assets: Asset[] }

interface CachedPhoto { ts: number; payload: { photoUrl: string; dateTaken?: string; location?: string; caption?: string } }

let cache: CachedPhoto | null = null;
const TTL_MS = 60 * 60 * 1000;

async function tryMemoryLane(base: string, key: string): Promise<Asset | null> {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth() + 1;
  const r = await fetch(`${base}/api/search/memory-lane?day=${day}&month=${month}`, {
    headers: { 'x-api-key': key }
  });
  if (!r.ok) return null;
  try {
    const data = (await r.json()) as MemoryLaneEntry[];
    for (const entry of data) {
      if (Array.isArray(entry.assets) && entry.assets.length > 0) {
        return entry.assets[Math.floor(Math.random() * entry.assets.length)];
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function tryAlbumRandom(base: string, key: string, albumId: string): Promise<Asset | null> {
  const r = await fetch(`${base}/api/album/${albumId}`, { headers: { 'x-api-key': key } });
  if (!r.ok) return null;
  try {
    const data = (await r.json()) as AlbumResp;
    if (Array.isArray(data.assets) && data.assets.length > 0) {
      return data.assets[Math.floor(Math.random() * data.assets.length)];
    }
  } catch {
    return null;
  }
  return null;
}

export const GET: RequestHandler = async () => {
  const base = process.env.IMMICH_URL;
  const key = process.env.IMMICH_API_KEY;
  const albumId = process.env.IMMICH_ALBUM_ID;
  if (!base || !key) throw error(500, 'IMMICH_URL or IMMICH_API_KEY not configured');

  const now = Date.now();
  if (cache && now - cache.ts < TTL_MS) {
    return json(cache.payload);
  }

  let asset = await tryMemoryLane(base, key);
  if (!asset && albumId) asset = await tryAlbumRandom(base, key, albumId);

  if (!asset) throw error(503, 'no photo available');

  const payload = {
    photoUrl: `/api/immich/asset/${asset.id}`,
    dateTaken: asset.exifInfo?.dateTimeOriginal,
    location: asset.exifInfo?.city
      ? `${asset.exifInfo.city}${asset.exifInfo.country ? ', ' + asset.exifInfo.country : ''}`
      : undefined
  };
  cache = { ts: now, payload };
  return json(payload);
};
```

- [ ] **Step 4: Run tests pass**

Run: `cd frontend && pnpm test src/routes/api/immich/photo-of-day/server.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
cd frontend && pnpm check
git add frontend/src/routes/api/immich/photo-of-day/+server.ts frontend/src/routes/api/immich/photo-of-day/server.test.ts
git commit -m "feat(immich): photo-of-day proxy with memory-lane + album fallback"
```

---

## Task 25: Immich asset binary proxy

**Files:**
- Create: `frontend/src/routes/api/immich/asset/[id]/+server.ts`

- [ ] **Step 1: Implement the binary proxy**

Create `frontend/src/routes/api/immich/asset/[id]/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, url }) => {
  const base = process.env.IMMICH_URL;
  const key = process.env.IMMICH_API_KEY;
  if (!base || !key) throw error(500, 'IMMICH_URL or IMMICH_API_KEY not configured');

  // Default to thumbnail; allow ?size=preview|original via query.
  const size = url.searchParams.get('size') ?? 'preview';
  const upstream = `${base}/api/asset/thumbnail/${params.id}?format=jpeg&size=${encodeURIComponent(size)}`;

  const r = await fetch(upstream, { headers: { 'x-api-key': key } });
  if (!r.ok) throw error(r.status, `immich asset ${params.id} fetch failed`);

  const buf = await r.arrayBuffer();
  return new Response(buf, {
    headers: {
      'content-type': r.headers.get('content-type') ?? 'image/jpeg',
      'cache-control': 'public, max-age=3600'
    }
  });
};
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/api/immich/asset/[id]/+server.ts
git commit -m "feat(immich): asset binary proxy"
```

---

## Task 26: .env.example + remote-deploy template additions

**Files:**
- Modify: `.env.example` (or create if missing)
- Modify: `installer/remote-deploy.sh`

- [ ] **Step 1: Verify or create .env.example**

Run: `ls frontend/.env.example 2>/dev/null || ls .env.example 2>/dev/null`

If neither exists, create `frontend/.env.example`:

```
HA_URL=
HA_TOKEN=
GROCERY_URL=
GROCERY_KEY=
IMMICH_URL=https://immich.npalakurla.net
IMMICH_API_KEY=
IMMICH_ALBUM_ID=
```

If one exists, add only the IMMICH_* lines.

- [ ] **Step 2: Add to remote-deploy.sh template**

Run: `grep -n "GROCERY_URL\|HA_URL" installer/remote-deploy.sh | head`

After whichever block writes `/etc/mirror/config.env`, add IMMICH_* there too. Append (or merge) into the env-write block:

```bash
IMMICH_URL=${IMMICH_URL:-https://immich.npalakurla.net}
IMMICH_API_KEY=${IMMICH_API_KEY:-}
IMMICH_ALBUM_ID=${IMMICH_ALBUM_ID:-}
```

(Exact placement depends on existing script structure — match the pattern other env keys follow.)

- [ ] **Step 3: Commit**

```bash
git add frontend/.env.example installer/remote-deploy.sh
git commit -m "feat(env): IMMICH_* variables in templates"
```

---

## Task 27: ROLLOUT GATE — verify proxies in dev

- [ ] **Step 1: Local preview**

```bash
cd frontend && pnpm dev
```

Open: http://localhost:5173/?preset=editorial-daily

Verify:
- Tech news card now shows live HN headlines (when `news_tech` is the active card per current phase, or trigger via console)
- Immich photo card needs `IMMICH_URL` / `IMMICH_API_KEY` env to function. Without env, `/api/immich/photo-of-day` returns 500 → card shows "card unavailable" line. That's the expected dev state.

If user has Immich set up: drop env vars into `frontend/.env.local`, restart `pnpm dev`, verify photo loads.

**STOP. Show user. Get approval.**

---

# Phase 7 — Polish: error / empty / stale + skeleton loaders

## Task 28: Stale state + skeleton conventions

**Files:**
- Modify: each card component (CalendarDayCard, CalendarNextCard, CalendarTomorrowCard, WeatherHourlyCard, GroceryListCard, NotificationsCard, TechNewsCard) — add stale tracking

- [ ] **Step 1: Define a small helper**

Create `frontend/src/lib/cards/stale.ts`:

```ts
/**
 * Returns true when the last successful fetch is older than 3× the
 * card's refresh interval. Cards add `data-stale={isStale ? 'true' :
 * undefined}` to their root and CSS fades content to 60% opacity.
 */
export function isStale(lastSuccessTs: number, refreshIntervalMs: number): boolean {
  if (lastSuccessTs === 0) return false;
  return Date.now() - lastSuccessTs > 3 * refreshIntervalMs;
}
```

- [ ] **Step 2: Wire stale into one card as the pattern (TechNewsCard)**

Edit `frontend/src/lib/tiles/TechNewsCard.svelte`:

```svelte
<script lang="ts">
  // ... existing imports
  import { isStale } from '$lib/cards/stale.js';

  let lastSuccessTs = $state(0);
  // ... existing state

  async function load() {
    try {
      const r = await fetch(`${endpoint}?n=${n}`, { cache: 'no-store' });
      if (!r.ok) { failed = true; return; }
      const j = (await r.json()) as { items?: NewsItem[] };
      items = j.items ?? [];
      failed = false;
      lastSuccessTs = Date.now();
    } catch {
      failed = true;
    }
  }
  // ... unchanged

  const stale = $derived(isStale(lastSuccessTs, 10 * 60 * 1000));
</script>

<section class="news" data-stale={stale ? 'true' : undefined}>
  <!-- unchanged -->
</section>

<style>
  /* prepend */
  .news[data-stale='true'] { opacity: 0.6; }
  /* ... existing */
</style>
```

- [ ] **Step 3: Apply same pattern to the remaining REST-polling cards**

Apply identical `isStale` + `data-stale` wiring to:
- `GroceryListCard.svelte`
- `NotificationsCard.svelte`
- `ImmichPhotoCard.svelte`

For HA-entity-watching cards (`CalendarDayCard`, `CalendarNextCard`, `CalendarTomorrowCard`, `WeatherHourlyCard`): the entity store updates on every successful poll, but doesn't expose a success timestamp directly. Skip stale handling for these in v1; document as a v2 follow-up.

- [ ] **Step 4: Skeleton loader for first-load <5s**

Add to each REST-polling card (TechNews, Grocery, Notifications, Immich) — show a skeleton when `items.length === 0 && !failed && lastSuccessTs === 0`:

Example (TechNewsCard `<section>` body):

```svelte
{#if failed}
  <p class="fail">— card unavailable —</p>
{:else if lastSuccessTs === 0}
  <ol class="skel">
    <li><span class="skel-bar w70" /></li>
    <li><span class="skel-bar w90" /></li>
    <li><span class="skel-bar w60" /></li>
  </ol>
{:else if items.length === 0}
  <p class="empty">News brief unavailable</p>
{:else}
  <!-- existing list -->
{/if}
```

Append to each card's `<style>`:

```css
.skel { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.skel li { padding: 0.2rem 0; }
.skel-bar {
  display: inline-block;
  height: 0.85rem;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--line) 0%, var(--line-strong) 50%, var(--line) 100%);
  background-size: 200% 100%;
  animation: skel-shimmer 1.6s ease-in-out infinite;
}
.skel-bar.w70 { width: 70%; }
.skel-bar.w90 { width: 90%; }
.skel-bar.w60 { width: 60%; }
@keyframes skel-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

- [ ] **Step 5: Type-check + tests**

Run: `cd frontend && pnpm check && pnpm test`
Expected: 0 errors, all tests pass.

- [ ] **Step 6: ROLLOUT GATE — local preview**

```bash
cd frontend && pnpm dev
```

Verify:
- Tech news card shows skeleton briefly on first load, then real items
- Disconnect network → wait 30+ min → card fades to 60% (stale state). For dev: simulate by setting `lastSuccessTs` to `Date.now() - 31 * 60_000` via devtools.
- Hard fail (e.g. block /api/news/tech in DevTools network panel): "card unavailable" line shows.

**STOP. Show user. Get approval.**

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/cards/stale.ts frontend/src/lib/tiles/TechNewsCard.svelte frontend/src/lib/tiles/GroceryListCard.svelte frontend/src/lib/tiles/NotificationsCard.svelte frontend/src/lib/tiles/ImmichPhotoCard.svelte
git commit -m "feat(cards): skeleton + stale states for REST-polling cards"
```

---

# Phase 8 — Wire phase-driven defaults end-to-end

## Task 29: Confirm `editorial.portrait.json` already has all 3 sections

- [ ] **Step 1: Sanity-check the JSON**

Run: `cat frontend/src/lib/layout/bundled/editorial.portrait.json | python3 -m json.tool`

Confirm:
- 4 tiles total: header, section-2, section-3, section-4
- All three sections use `type: section_host`
- Each carries `props.channelConfig` matching the locked spec config

If anything's off, fix and amend the previous commit (`git commit --amend`).

- [ ] **Step 2: Verify**

Run: `cd frontend && pnpm check && pnpm test`
Expected: 0 errors, all pass.

This is a sanity gate — no commit needed unless something needed fixing.

---

# Phase 9 — Tests + smoke checklist + final ship gate

## Task 30: E2E Playwright test

**Files:**
- Create or modify: `frontend/tests/e2e/editorial-daily.spec.ts`

- [ ] **Step 1: Find existing Playwright config**

Run: `find frontend -name 'playwright.config*' -not -path '*/node_modules/*'`

If absent, defer this task — Playwright bootstrap is a separate spec. Skip step 2 and proceed to Task 31.

- [ ] **Step 2: Add demo-mode preset render test**

If config exists, create `frontend/tests/e2e/editorial-daily.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('editorial-daily preset renders all sections in demo mode', async ({ page }) => {
  await page.goto('http://localhost:5173/?preset=editorial-daily');

  // masthead
  await expect(page.locator('text=The Mirror')).toBeVisible();
  await expect(page.locator('text=Daily')).toBeVisible();

  // sections — section host wraps each, so we find by data-tile-id
  await expect(page.locator('[data-tile-id="section-2"]')).toBeVisible();
  await expect(page.locator('[data-tile-id="section-3"]')).toBeVisible();
  await expect(page.locator('[data-tile-id="section-4"]')).toBeVisible();

  // edition kicker is one of the four phase labels
  const kicker = page.locator('.kicker .flip');
  await expect(kicker).toContainText(/(Prātaḥ|Madhyāhna|Sandhyā|Rātri|Morning|Midday|Evening|Late) Edition/);
});
```

- [ ] **Step 3: Run e2e**

Run: `cd frontend && pnpm test:e2e`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/e2e/editorial-daily.spec.ts
git commit -m "test(e2e): editorial-daily renders sections + kicker"
```

---

## Task 31: Smoke checklist doc

**Files:**
- Create: `docs/mirror-daily-smoke.md`

- [ ] **Step 1: Write the smoke checklist**

Create `docs/mirror-daily-smoke.md`:

```markdown
# Mirror Daily v1 — Pre-Ship Smoke Checklist

Run all of these on **local kiosk-emulating browser** before ship.

## Setup

1. `cd frontend && pnpm install`
2. Copy `.env.example` to `.env.local`. Fill in:
   - `HA_URL`, `HA_TOKEN` (kiosk's existing values)
   - `IMMICH_URL`, `IMMICH_API_KEY`, `IMMICH_ALBUM_ID` (new)
3. `pnpm dev`
4. Open `http://localhost:5173/?preset=editorial-daily`

## Phase clock

- [ ] Edition kicker shows current phase's Sanskrit label
- [ ] After 8s, flips to English label
- [ ] Mac System Settings → Display → "Reduce motion": kicker shows `Sanskrit · English` static
- [ ] Force phase via system clock: set time to 04:59 → kicker reads "Rātri / Late". Set to 05:00 → reads "Prātaḥ / Morning".

## Sections + cards

- [ ] All 3 sections render their phase-default card
- [ ] Calendar cards show today's events (if any) or empty state
- [ ] Weather hourly shows next 6 hours
- [ ] Grocery shows pantry items or "Pantry's stocked"
- [ ] Notifications shows last 3 persistent_notifications or "All quiet"
- [ ] Tech news shows live HN headlines
- [ ] Immich photo loads from album / memory-lane

## Channel cycle

- [ ] Devtools: dispatch `mode_next` with `focusedTile` set to `section-2` → section 2 cycles to next pool entry
- [ ] Wait 10 min → override expires → section snaps back to phase default
- [ ] `clearOverride` (devtools) → instant snap-back

## Plex pre-empt

- [ ] Start playing on Plex → mirror swaps to full takeover within 7s
- [ ] Pause Plex → mirror stays in takeover (state still `paused` or `playing` depending on entity)
- [ ] Stop Plex → mirror returns to sections
- [ ] Rapid play/pause/play within 2s → no flicker (debounce works)

## Error + stale

- [ ] DevTools network: block `/api/news/tech` → tech news card shows "— card unavailable —"
- [ ] Set `lastSuccessTs` to `Date.now() - 31 * 60_000` via devtools → card fades to 60% opacity (stale)
- [ ] Restore network → card recovers on next refresh tick

## Long-run (10 min)

- [ ] No browser console errors
- [ ] Memory stable (devtools Performance tab: heap doesn't grow >50MB)
- [ ] FPS stable

## Ship gate

When every box above is ticked:

1. `pnpm check && pnpm test && pnpm test:e2e` all green
2. Manual demo to user
3. User explicit "ship it"
4. PR → review → merge to `main`
5. `installer/remote-deploy.sh` → kiosk
```

- [ ] **Step 2: Commit**

```bash
git add docs/mirror-daily-smoke.md
git commit -m "docs(mirror-daily): pre-ship smoke checklist"
```

---

## Task 32: FINAL SHIP GATE

**Manual user checklist before any push to `main` or kiosk deploy:**

- [ ] All tasks 1-31 complete + committed
- [ ] `pnpm check && pnpm test && pnpm test:e2e` all green
- [ ] Smoke checklist (`docs/mirror-daily-smoke.md`) all boxes ticked on local
- [ ] Plex pre-empt verified manually (HA REST or actual playback)
- [ ] 10-minute uptime on local — no leaks, no jank
- [ ] User explicit "ship it"

Only after all above:

```bash
# 1. Push branch
git push origin claude/gesture-control-smart-mirror-fbt6V

# 2. Open PR, get review, merge
gh pr create --title "feat(mirror-daily): v1 production preset" --body "$(cat <<'EOF'
## Summary
- Phase clock with Vedic Sanskrit phases + 8s bilingual kicker flip
- Section channel engine with 10min override timeout
- 7 content cards (3 calendar variants, weather, grocery, news, immich, notifications)
- Plex full-takeover pre-empt
- Focus-aware gesture cycling
- 2 server proxies (Immich photo-of-day, HN tech news)

## Test plan
- [ ] pnpm check + pnpm test + pnpm test:e2e green
- [ ] docs/mirror-daily-smoke.md all boxes ticked
- [ ] User-led demo on local
- [ ] Plex pre-empt verified
EOF
)"

# 3. After merge: deploy
bash installer/remote-deploy.sh
```

---

## Spec coverage check

Cross-check against the spec sections:

| Spec section | Plan task |
|--------------|-----------|
| Phase clock | Tasks 1, 2 |
| Edition kicker — bilingual flip | Task 3 |
| Section channel engine | Tasks 4, 5, 6, 8 |
| Default map | Task 5, Task 10, Task 18 |
| Channel state machine | Task 6 |
| Persistence (memory-only) | Task 6 implicitly — no localStorage |
| 7 cards | Tasks 9, 11–17 |
| Card props contract | Task 4 |
| Visual treatment (chromeless, kicker, hairline) | Tasks 9, 11–17 |
| Plex pre-empt | Tasks 20, 21, 22 |
| Gesture binding | Task 19 |
| Refresh discipline | Each card task |
| Error / loading / empty / stale | Task 28 |
| Immich proxy | Tasks 24, 25 |
| HN tech news proxy | Task 23 |
| Env additions | Task 26 |
| Files (new + modified) | Tasks throughout |
| Tests | Per-task test steps + Task 30 e2e |
| Rollout sequence | Phases 1-9 with explicit ROLLOUT GATEs |
| Final ship gate | Task 32 |
| Out of scope | Implicit — none of the deferred items have tasks |
| Risks | Task 22 step 2 covers Plex entity name; Task 9 step 1 covers calendar entity name; Tasks 23/24 cover defensive parsing + caching |
