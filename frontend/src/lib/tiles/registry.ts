import type { Component } from 'svelte';
import ClockTile from './ClockTile.svelte';
import WeatherTile from './WeatherTile.svelte';
import CalendarTile from './CalendarTile.svelte';
import NewsBriefingTile from './NewsBriefingTile.svelte';
import ServiceStatusTile from './ServiceStatusTile.svelte';
import HostHealthTile from './HostHealthTile.svelte';
import AlertsTile from './AlertsTile.svelte';
import LogTailTile from './LogTailTile.svelte';
import MetricsChartTile from './MetricsChartTile.svelte';
import IframeTile from './IframeTile.svelte';

/**
 * Tile registry. Each build phase registers a new batch. Grid.svelte
 * looks up types here; unknown types render an inline placeholder
 * rather than crashing the grid.
 */
export const TILES: Record<string, Component<any>> = {
  clock: ClockTile,
  weather: WeatherTile,
  calendar: CalendarTile,
  news_briefing: NewsBriefingTile,
  service_status: ServiceStatusTile,
  host_health: HostHealthTile,
  alerts: AlertsTile,
  log_tail: LogTailTile,
  metrics_chart: MetricsChartTile,
  iframe: IframeTile
};

export type TileType = keyof typeof TILES;

export function isKnownTile(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(TILES, type);
}
