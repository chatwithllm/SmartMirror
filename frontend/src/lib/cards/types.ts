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
