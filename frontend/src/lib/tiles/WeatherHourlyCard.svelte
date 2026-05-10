<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { watchEntity, type HaEntity } from '$lib/ha/entity.js';
  import { weatherIcon } from '$lib/weather/icons.js';

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

  interface ForecastHour {
    datetime: string;
    temperature: number;
    condition: string;
    precipitation?: number;
    precipitation_probability?: number;
  }

  // Modern HA: hourly forecast comes from weather/get_forecasts
  // service, not state attributes. Poll every 15 min.
  let hours = $state<ForecastHour[]>([]);
  let forecastTimer: ReturnType<typeof setInterval> | null = null;

  async function fetchHourly(): Promise<void> {
    if (!entityId) return;
    try {
      const r = await fetch(
        '/api/ha/api/services/weather/get_forecasts?return_response',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ entity_id: entityId, type: 'hourly' })
        }
      );
      if (!r.ok) return;
      const j = (await r.json()) as {
        service_response?: Record<string, { forecast?: ForecastHour[] }>;
      };
      const fc = j.service_response?.[entityId]?.forecast ?? [];
      hours = fc.slice(0, 6);
    } catch {
      /* swallow — keep last known forecast */
    }
  }

  onMount(() => {
    if (!isActive) return;
    void fetchHourly();
    forecastTimer = setInterval(fetchHourly, 15 * 60 * 1000);
  });
  onDestroy(() => {
    if (forecastTimer) clearInterval(forecastTimer);
  });

  const isF = $derived(
    (entity?.attributes as { temperature_unit?: string } | undefined)?.temperature_unit === '°F'
  );

  // Forecast temps come in entity's native units. Convert to display
  // unit per `units` prop.
  const fmtT = (t: number): string => {
    // First normalize source → C, then format per target.
    const c = isF ? ((t - 32) * 5) / 9 : t;
    return units === 'imperial' ? `${Math.round((c * 9) / 5 + 32)}°` : `${Math.round(c)}°`;
  };
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
          <span class="ic" aria-hidden="true">{weatherIcon(h.condition)}</span>
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
  li {
    display: grid;
    grid-template-columns: 3rem 1.6rem 3rem 1fr;
    gap: 0.6rem;
    align-items: baseline;
    font-style: italic;
    font-size: 0.92rem;
  }
  .hr { color: var(--dim); font-feature-settings: 'tnum'; }
  .ic {
    font-size: 1rem;
    text-align: center;
    /* Subtle filter so emoji blends with editorial gold/dim palette
     * without being totally desaturated. */
    filter: saturate(0.7) brightness(0.95);
    line-height: 1;
  }
  .t { color: var(--accent); font-weight: 700; font-feature-settings: 'tnum'; }
  .c { color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rule { position: absolute; left: 0.8rem; right: 0.8rem; bottom: 0; height: 1px; background: var(--line); }
</style>
