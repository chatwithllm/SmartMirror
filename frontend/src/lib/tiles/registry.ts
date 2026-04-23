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
import PlexPlayerTile from './PlexPlayerTile.svelte';
import PlexNowPlayingTile from './PlexNowPlayingTile.svelte';
import PlexRecentTile from './PlexRecentTile.svelte';
import FrigateCameraTile from './FrigateCameraTile.svelte';
import ImmichSlideshowTile from './ImmichSlideshowTile.svelte';
import YouTubeTile from './YouTubeTile.svelte';
import PodcastTile from './PodcastTile.svelte';
import InventoryGridTile from './InventoryGridTile.svelte';
import LowStockAlertTile from './LowStockAlertTile.svelte';
import ShoppingListTile from './ShoppingListTile.svelte';
import RecipeSuggestTile from './RecipeSuggestTile.svelte';
import ExpiryTile from './ExpiryTile.svelte';
import BudgetTile from './BudgetTile.svelte';
import PomodoroTile from './PomodoroTile.svelte';
import MeetingCountdownTile from './MeetingCountdownTile.svelte';
import ProjectBoardTile from './ProjectBoardTile.svelte';
import PrListTile from './PrListTile.svelte';
import DeployPipelineTile from './DeployPipelineTile.svelte';
import MessagesTile from './MessagesTile.svelte';

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
  iframe: IframeTile,
  plex_player: PlexPlayerTile,
  plex_now_playing: PlexNowPlayingTile,
  plex_recent: PlexRecentTile,
  frigate_camera: FrigateCameraTile,
  immich_slideshow: ImmichSlideshowTile,
  youtube: YouTubeTile,
  podcast: PodcastTile,
  inventory_grid: InventoryGridTile,
  low_stock_alert: LowStockAlertTile,
  shopping_list: ShoppingListTile,
  recipe_suggest: RecipeSuggestTile,
  expiry: ExpiryTile,
  budget: BudgetTile,
  pomodoro: PomodoroTile,
  meeting_countdown: MeetingCountdownTile,
  project_board: ProjectBoardTile,
  pr_list: PrListTile,
  deploy_pipeline: DeployPipelineTile,
  messages: MessagesTile
};

export type TileType = keyof typeof TILES;

export function isKnownTile(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(TILES, type);
}
