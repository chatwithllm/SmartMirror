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

import CalendarDayCard from '$lib/tiles/CalendarDayCard.svelte';

registerCard({
  id: 'calendar_today',
  component: CalendarDayCard as never,
  refreshIntervalMs: 60_000,
  emptyState: 'No events today — clear day ahead'
});

import CalendarNextCard from '$lib/tiles/CalendarNextCard.svelte';
registerCard({
  id: 'calendar_next',
  component: CalendarNextCard as never,
  refreshIntervalMs: 60_000,
  emptyState: 'Nothing scheduled'
});

import CalendarTomorrowCard from '$lib/tiles/CalendarTomorrowCard.svelte';
registerCard({
  id: 'calendar_tomorrow',
  component: CalendarTomorrowCard as never,
  refreshIntervalMs: 60_000,
  emptyState: "Tomorrow's clear"
});
