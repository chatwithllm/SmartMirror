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
