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

import WeatherHourlyCard from '$lib/tiles/WeatherHourlyCard.svelte';
registerCard({
  id: 'weather_hourly',
  component: WeatherHourlyCard as never,
  refreshIntervalMs: 5 * 60 * 1000,
  emptyState: 'Forecast unavailable'
});

import GroceryListCard from '$lib/tiles/GroceryListCard.svelte';
registerCard({
  id: 'grocery',
  component: GroceryListCard as never,
  refreshIntervalMs: 30_000,
  emptyState: "Pantry's stocked"
});

import NotificationsCard from '$lib/tiles/NotificationsCard.svelte';
registerCard({
  id: 'ha_notifications',
  component: NotificationsCard as never,
  refreshIntervalMs: 15_000,
  emptyState: 'All quiet'
});

import TechNewsCard from '$lib/tiles/TechNewsCard.svelte';
registerCard({
  id: 'news_tech',
  component: TechNewsCard as never,
  refreshIntervalMs: 10 * 60 * 1000,
  emptyState: 'News brief unavailable'
});

import ImmichPhotoCard from '$lib/tiles/ImmichPhotoCard.svelte';
registerCard({
  id: 'immich_photo',
  component: ImmichPhotoCard as never,
  refreshIntervalMs: 60 * 60 * 1000,
  emptyState: 'From the archive'
});

import CameraGridCard from '$lib/tiles/CameraGridCard.svelte';
registerCard({
  id: 'camera_grid',
  component: CameraGridCard as never,
  refreshIntervalMs: 60_000, // entity poll cadence; cell-level frame refresh is faster
  emptyState: 'Cameras offline'
});

import KanbanActiveCard from '$lib/tiles/KanbanActiveCard.svelte';
registerCard({
  id: 'kanban_active',
  component: KanbanActiveCard as never,
  refreshIntervalMs: 30_000,
  emptyState: 'Inbox zero — nothing in flight'
});
