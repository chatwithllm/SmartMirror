# Mirror Daily v1 — Production Design

**Status:** Design approved, ready for implementation planning.
**Date:** 2026-05-09.
**Scope:** `editorial-daily` preset, portrait orientation only.
**Out of scope:** IT infrastructure preset, HA entity push form, health nudges,
kanban metrics, landscape variant. These are sub-projects 2–5 to brainstorm
later.

## Goal

Turn the editorial-daily preset into an all-day default that surfaces the right
content at the right hour, supports manual override, and stops requiring
piecemeal layout edits. Production-grade enough to be the kiosk's resting state.

## Non-goals

- Replacing existing tiles (calendar, weather, grocery, plex stay as-is and are
  wrapped, not rewritten).
- Persisting manual override state across page reloads (memory-only for v1).
- Animating section content swaps beyond what FLIP already provides.
- Auto-fallback when a card hard-fails. A failed card shows a quiet line; the
  user manually swipes to next-in-pool.

## Use case

Mirror Daily is the kiosk's default preset. It runs every hour the user is awake
and changes its surface contextually:

- Time-of-day **phase** swaps section defaults automatically.
- **Gesture** (swipe ←/→ on a focused section) cycles that section's channel.
- Manual override **expires after 10 minutes** and falls back to phase default.
- Plex playing **pre-empts** sections 2/3/4 (full takeover beneath the
  masthead).

## Phase clock

Four phases with Sanskrit names + English subtitles. Boundaries:

| Phase | Hours | Sanskrit | English |
|-------|-------|----------|---------|
| Prātaḥ | 05:00 → 10:59 | Prātaḥ | Morning |
| Madhyāhna | 11:00 → 16:59 | Madhyāhna | Midday |
| Sandhyā | 17:00 → 21:59 | Sandhyā | Evening |
| Rātri | 22:00 → 04:59 | Rātri | Late |

Boundaries are inclusive of the lower bound, exclusive of the upper (matches the
`<` comparisons below).

**Derivation (`$lib/phase/clock.ts`):**

```ts
type Phase = 'pratah' | 'madhyahna' | 'sandhya' | 'ratri';

function phaseAt(d: Date): Phase {
  const h = d.getHours();
  if (h < 5)  return 'ratri';
  if (h < 11) return 'pratah';
  if (h < 17) return 'madhyahna';
  if (h < 22) return 'sandhya';
  return 'ratri';
}
```

`currentPhase` Svelte store recomputes every 60s. Phase change emits
`mirror:phase_change` (window event); each section listens and calls
`channel.applyPhaseDefault(newPhase)`.

## Edition kicker — bilingual flip

`EditorialHeaderTile`'s kicker reads `$currentPhase` and toggles every **8s**
between Sanskrit (with IAST diacritics) and English:

```
— Prātaḥ Edition —     ↔     — Morning Edition —
```

CSS cross-fade, `opacity 0 → 1` over 400ms. `prefers-reduced-motion` falls back
to side-by-side static `Prātaḥ · Morning Edition`.

## Section channel engine

Three sections (2/3/4) each are a "channel" with an ordered card pool and a
phase→default-card map.

### Default map (locked)

| Phase | Section 2 (hero) | Section 3 | Section 4 |
|-------|------------------|-----------|-----------|
| Prātaḥ (5–11) | Calendar — Today | Tech News | Weather Hourly |
| Madhyāhna (11–17) | Calendar — Next | Grocery / Pantry | HA Notifications |
| Sandhyā (17–22) | Calendar — Tomorrow | Tech News | Immich Photo |
| Rātri (22–5) | Immich Photo | Calendar — Tomorrow | HA Notifications |

### Channel pools (gesture cycle within)

```ts
const CHANNELS: Record<SectionId, ChannelConfig> = {
  'section-2': {
    pool: ['calendar_today', 'immich_photo', 'news_tech', 'calendar_tomorrow', 'calendar_next'],
    phaseDefaults: {
      pratah:    'calendar_today',
      madhyahna: 'calendar_next',
      sandhya:   'calendar_tomorrow',
      ratri:     'immich_photo'
    }
  },
  'section-3': {
    pool: ['news_tech', 'grocery', 'calendar_today', 'calendar_tomorrow'],
    phaseDefaults: {
      pratah:    'news_tech',
      madhyahna: 'grocery',
      sandhya:   'news_tech',
      ratri:     'calendar_tomorrow'
    }
  },
  'section-4': {
    pool: ['weather_hourly', 'ha_notifications', 'immich_photo'],
    phaseDefaults: {
      pratah:    'weather_hourly',
      madhyahna: 'ha_notifications',
      sandhya:   'immich_photo',
      ratri:     'ha_notifications'
    }
  }
};
```

### Channel state machine

```ts
interface ChannelState {
  pool: CardId[];
  phaseDefaults: Record<Phase, CardId>;
  currentCardId: CardId;
  override?: { cardId: CardId; expiresAt: number };
}
```

Actions:
- `cycleNext(sectionId)` — advance pool index, set
  `override = { cardId, expiresAt: now + 600_000 }`.
- `cyclePrev(sectionId)` — reverse.
- `applyPhaseDefault(phase)` — for each section: if override expired or
  missing, swap to phase default. Active override wins.
- `clearOverride(sectionId)` — explicit reset to current phase default.
- `tickOverrides()` — runs every 30s, clears expired overrides → applies
  phase default.

### Persistence

Override state lives in memory only. Page reload wipes overrides → channel
reverts to current phase default. Acceptable for kiosk (rarely reloads).
localStorage persistence is a v2 concern.

## Card vocabulary (7 cards)

Each card is `{ component, dataSource, refreshMs, emptyState }`. Cards plug into
`SectionHostTile` which mounts the active card from the channel state.

| Card ID | Component (new) | Data source | Refresh | Empty state |
|---------|-----------------|-------------|---------|-------------|
| `calendar_today` | `CalendarDayCard.svelte` | HA `calendar.palakurla4340_gmail_com` REST, 24h window | 60s | "No events today — clear day ahead" |
| `calendar_next` | `CalendarNextCard.svelte` | same calendar entity, filter to next event | 60s | "Nothing scheduled" |
| `calendar_tomorrow` | `CalendarTomorrowCard.svelte` | same, filter `start >= tomorrow 00:00` | 60s | "Tomorrow's clear" |
| `news_tech` | `TechNewsCard.svelte` | `/api/news/tech` (HN top, score≥100) | 10min | "News brief unavailable" |
| `grocery` | `GroceryListCard.svelte` | existing `/api/grocery/*` | 30s | "Pantry's stocked" |
| `immich_photo` | `ImmichPhotoCard.svelte` | `/api/immich/photo-of-day` | 60min | hero gradient + "From the archive" |
| `weather_hourly` | `WeatherHourlyCard.svelte` | `weather.4340` `forecast` attribute, hourly slice | 5min | "Forecast unavailable" |
| `ha_notifications` | `NotificationsCard.svelte` | `persistent_notification.*` entities, last 3 by `created_at` | 15s | "All quiet" |

Plus one off-channel card:

| `plex_now_playing` | `PlexNowPlayingCard.svelte` (wraps existing `PlexPlayerTile`) | existing Plex entity | 5s |

**Card props contract:**

```ts
interface CardProps {
  id: string;
  phase: Phase;
  isActive: boolean;             // mounted vs preloaded
  props?: Record<string, unknown>;
}
```

When `!isActive`, cards pause their data fetch.

**Visual treatment:**

- Chromeless inside `SectionHostTile` (no nested borders).
- Editorial typography — Fraunces serif, gold accent for headings.
- Each card gets a small italic small-caps kicker top strip
  (`— Today's Calendar —`).
- Bottom hairline rule for visual rhythm.

## Plex pre-empt

Separate from channels. A dedicated client-side watcher subscribes to the Plex
entity:

```ts
// $lib/plex/preempt.ts
export const plexActive: Writable<boolean>;
```

`+page.svelte` renders either `<SectionGrid />` or `<PlexFullCard />` based on
`plexActive`. Plex full card spans rows 2–14 beneath the masthead; sections
2/3/4 unmount.

When `plexActive` flips false, sections re-mount with current channel state.
Override timers continue running while Plex is active (so they expire on
schedule).

## Gesture binding

Existing handler additions in `$lib/gesture/handlers.ts`:

```ts
mode_next: () => {
  const focused = get(focusedTile);
  const sectionId = matchSectionId(focused);
  if (sectionId) channelStore.cycleNext(sectionId);
  else hassCmd('input_select.select_next', 'input_select.mirror_preset');
},
// mode_prev mirrors
```

`focus` gesture continues to set `focusedTile` (existing).
`tile_fullscreen` / `tile_minimize` / `media_pause` / `lock` / `wake` /
`alert_ack` unchanged.

## Refresh discipline

- Each card declares `refreshIntervalMs`. `SectionHostTile` sets `setInterval`
  on mount, clears on unmount.
- HA-entity-watching cards reuse `watchEntity()` — single shared poll per
  entity.
- `forceRefresh` event (HA-button or future gesture) triggers immediate
  `refetch()` and resets the interval clock.
- Cards in pool but not mounted have data fetch **paused**.

## Error / loading / empty hierarchy

| State | Treatment |
|-------|-----------|
| Loading (first fetch <5s) | Skeleton: kicker + 2-3 light dim placeholder rows in Fraunces italic, no spinner |
| Empty (success but no data) | Card-specific empty string (table above) |
| Hard fail (network error / 5xx) | Inline `— card unavailable —` italic small caps, `--dimmer`. **No auto-fallback.** User can swipe to next-in-pool. |
| Stale (last successful fetch > 3× interval) | `[data-stale="true"]` on card root, content fades to 60% opacity. Background retries continue. |

## New integrations

### Immich proxy (`/api/immich/photo-of-day`)

Returns `{ photoUrl, dateTaken?, location?, caption? }`.

1. Fetch `${IMMICH_URL}/api/search/memory-lane?day=...&month=...` for
   today's "on this day" memories.
2. If empty/404 → fetch `${IMMICH_URL}/api/album/${IMMICH_ALBUM_ID}/assets`,
   pick random.
3. Return asset thumbnail URL proxied through `/api/immich/asset/[id]` to keep
   the API key server-side.
4. In-memory cache, 60min TTL.
5. Auth: `x-api-key: ${IMMICH_API_KEY}` header.

Env: `IMMICH_URL`, `IMMICH_API_KEY`, `IMMICH_ALBUM_ID` (optional —
falls back to all assets when unset).

### HN tech news proxy (`/api/news/tech`)

Returns `{ items: [{ title, url, score, by, time }] }`.

1. `GET https://hacker-news.firebaseio.com/v0/topstories.json` → array of IDs.
2. Fetch top 30 items in parallel (max-5 concurrency).
3. Filter `score >= 100`, take first 5.
4. In-memory cache, 10min TTL.
5. No auth required (public API).

## Files

### New

```
frontend/src/lib/phase/
  clock.ts
  clock.test.ts

frontend/src/lib/sections/
  channel.ts
  channel.test.ts
  config.ts

frontend/src/lib/cards/
  registry.ts
  types.ts

frontend/src/lib/tiles/
  SectionHostTile.svelte
  CalendarDayCard.svelte
  CalendarNextCard.svelte
  CalendarTomorrowCard.svelte
  TechNewsCard.svelte
  GroceryListCard.svelte
  ImmichPhotoCard.svelte
  WeatherHourlyCard.svelte
  NotificationsCard.svelte
  PlexNowPlayingCard.svelte

frontend/src/lib/plex/
  preempt.ts

frontend/src/routes/api/immich/
  photo-of-day/+server.ts
  asset/[id]/+server.ts

frontend/src/routes/api/news/
  tech/+server.ts
```

### Modified

```
frontend/src/lib/tiles/EditorialHeaderTile.svelte
  — kicker reads $currentPhase, 8s flip Sanskrit↔English
  — drop hardcoded edition strings

frontend/src/lib/tiles/registry.ts
  — register section_host
  — drop placeholder usage from this preset (keep for morning preset)

frontend/src/lib/gesture/handlers.ts
  — focused-section-aware mode_next / mode_prev routing

frontend/src/routes/+page.svelte
  — render <PlexFullCard /> when plexActive, else <Grid />
  — wire phase clock + channel stores on mount

frontend/src/lib/layout/bundled/editorial.portrait.json
  — replace 3 placeholder tiles with 3 section_host tiles
  — section ids: 'section-2', 'section-3', 'section-4'
  — props: { sectionId, channelConfig: { pool, phaseDefaults } }
```

### Env additions

```
IMMICH_URL=https://immich.npalakurla.net
IMMICH_API_KEY=<key>
IMMICH_ALBUM_ID=<optional>
```

Add to `.env.example` and `installer/remote-deploy.sh` template.

## Tests

- `clock.test.ts` — phase boundaries (5/11/17/22 + edges).
- `channel.test.ts` — cycle, override, expiry, phase-change-with-active-override.
- `cards/registry.test.ts` — every CardId has component + valid refreshMs.
- `routes/api/immich/photo-of-day.test.ts` — memory-first, fallback, cache,
  API-key passthrough.
- `routes/api/news/tech.test.ts` — score threshold, ordering, dedupe, cache.
- E2E (Playwright): URL-switcher demo mode renders section_host with default
  cards.

## Rollout sequence

Each step is local-preview gated. **No commit before user approval; no push to
`main` or kiosk deploy until step 9 is done end-to-end.**

```
For each step:
  1. Implement
  2. pnpm check + pnpm test green
  3. pnpm dev → http://localhost:5173/?preset=editorial-daily
  4. User reviews in browser → approve / request changes
  5. ↻ if changes
  6. Atomic commit (single concern)
  7. Move to next step
```

Steps:

1. **Phase clock + kicker flip** in EditorialHeaderTile. Smallest visible win.
2. **SectionHostTile + channel store + 1 card (calendar_today)**. End-to-end engine proof.
3. **Card registry + remaining 6 cards**. Fill the pool.
4. **Gesture binding** — focus-aware `mode_next` / `mode_prev`.
5. **Plex pre-empt** — full-takeover renderer.
6. **Immich + HN proxies** — server routes + env wiring.
7. **Polish: error / empty / stale states + skeleton loaders.**
8. **Full editorial.portrait.json swap** — replace placeholders with section_host tiles.
9. **Tests + smoke checklist on local.**

### Final ship gate (after step 9)

1. Full preset preview on local — every phase forced via URL param (mock phase
   clock).
2. Plex pre-empt manually toggled (HA REST or local mock).
3. All cards survive 10-min uptime — no leaks, no jank.
4. User explicit "ship it".
5. PR → review → merge → `installer/remote-deploy.sh` → kiosk.

## Out of scope for v1

- Sections in `editorial.landscape.json` (kiosk is portrait-only).
- Override persistence across reloads.
- Override expiry visual countdown.
- Sub-projects 2–5 (IT infra preset, HA push form, health nudges, kanban metrics).

## Risks

- **Calendar entity name `calendar.palakurla4340_gmail_com`** — verify it's
  still the active calendar entity at implementation time. If renamed, three
  card components share a single config constant — single update point.
- **Plex entity name** — pin the exact `media_player.*` entity at implementation
  time (whatever the existing `PlexPlayerTile` already watches). The pre-empt
  watcher should reuse the same entity, not duplicate the lookup.
- **Immich API stability** — `/api/search/memory-lane` shape may change between
  Immich releases. Wrap in defensive parsing, fall back to album random on any
  parse error.
- **HN does occasionally surface political stories** — the score-only filter
  isn't a politics filter, just a quality floor. v1 ships as-is; if noise shows
  up in production, add a deny-list of domains/keywords as a v2 follow-up.
- **HN rate limits** — Firebase backend has no published rate limit but the
  10min cache should keep us well under any reasonable threshold.
- **Plex pre-empt loop** — if Plex entity flickers state (paused → playing →
  paused rapidly), section grid will rebuild repeatedly. Mitigate via a 2s
  debounce on the `plexActive` write.
- **Phase change while Plex playing** — phase store keeps ticking and channels
  apply phase defaults even when sections are unmounted (Plex pre-empt). When
  Plex stops, sections re-mount with the latest phase default rather than the
  stale state from when Plex started. Documented; tested in `channel.test.ts`.
