<script lang="ts">
  import { onDestroy } from 'svelte';
  import BaseTile from './BaseTile.svelte';
  import { watchEntity, type HaEntity } from '$lib/ha/entity.js';

  interface WeatherProps {
    entity_id?: string;         // e.g. weather.home — pulls live HA data
    units?: 'metric' | 'imperial';
    days?: number;
    location?: string;
    demo?: {
      tempC: number;
      condition: string;
      high: number;
      low: number;
      forecast?: { day: string; tempC: number; condition: string }[];
    };
  }

  interface Props {
    id: string;
    props?: WeatherProps;
  }

  let { id, props = {} }: Props = $props();

  const units = $derived(props.units ?? 'metric');
  const days = $derived(Math.min(Math.max(props.days ?? 3, 1), 7));

  // HA entity watch — only if entity_id provided.
  let haEntity = $state<HaEntity | null>(null);
  let stopWatch: (() => void) | null = null;

  $effect(() => {
    stopWatch?.();
    haEntity = null;
    if (!props.entity_id) return;
    const w = watchEntity(props.entity_id, 30_000);
    const unsub = w.store.subscribe((e) => (haEntity = e));
    stopWatch = () => {
      unsub();
      w.stop();
    };
  });
  onDestroy(() => stopWatch?.());

  const demo = $derived(
    props.demo ?? {
      tempC: 18,
      condition: 'Partly cloudy',
      high: 22,
      low: 12,
      forecast: [
        { day: 'Tue', tempC: 20, condition: '☀' },
        { day: 'Wed', tempC: 17, condition: '☁' },
        { day: 'Thu', tempC: 14, condition: '⛆' },
        { day: 'Fri', tempC: 16, condition: '☁' },
        { day: 'Sat', tempC: 19, condition: '☀' }
      ]
    }
  );

  // Resolve live data from HA or fall back to demo.
  const current = $derived.by(() => {
    if (haEntity) {
      const a = haEntity.attributes as {
        temperature?: number;
        temperature_unit?: string;
        templow?: number;
        forecast?: { datetime: string; temperature: number; condition: string }[];
      };
      const tempC =
        typeof a.temperature === 'number'
          ? a.temperature_unit === '°F'
            ? ((a.temperature - 32) * 5) / 9
            : a.temperature
          : demo.tempC;
      const condition = haEntity.state || demo.condition;
      const fc = a.forecast ?? [];
      const forecast = fc.slice(0, 7).map((f) => ({
        day: new Date(f.datetime).toLocaleDateString('en-GB', { weekday: 'short' }),
        tempC: f.temperature,
        condition: f.condition
      }));
      return {
        tempC,
        condition,
        high: forecast[0]?.tempC ?? demo.high,
        low: demo.low,
        forecast: forecast.length ? forecast : demo.forecast
      };
    }
    return demo;
  });

  function fmt(tempC: number) {
    if (units === 'imperial') return `${Math.round((tempC * 9) / 5 + 32)}°`;
    return `${Math.round(tempC)}°`;
  }
</script>

<BaseTile {id} type="weather" label="Weather">
  <div class="wx" data-testid="weather">
    <div class="current">
      <div class="temp" data-testid="weather-temp">{fmt(current.tempC)}</div>
      <div class="cond">{current.condition}</div>
      <div class="hilo mono">H {fmt(current.high)} · L {fmt(current.low)}</div>
    </div>
    {#if current.forecast?.length}
      <div class="forecast">
        {#each current.forecast.slice(0, days) as f (f.day)}
          <div class="f-cell">
            <div class="f-day mono">{f.day}</div>
            <div class="f-icon">{f.condition}</div>
            <div class="f-t">{fmt(f.tempC)}</div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</BaseTile>

<style>
  .wx {
    display: flex;
    flex-direction: column;
    gap: var(--gap-md);
    width: 100%;
    height: 100%;
    padding: var(--gap-sm);
  }
  .current {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .temp {
    font-size: clamp(36px, 8vw, 96px);
    font-weight: 300;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .cond {
    font-size: 1.05rem;
    color: var(--dim);
    letter-spacing: 0.02em;
    text-transform: capitalize;
  }
  .hilo {
    font-size: 0.85rem;
    color: var(--dimmer);
  }
  .forecast {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
    gap: var(--gap-sm);
    align-content: end;
  }
  .f-cell {
    text-align: center;
    padding: 4px 0;
    border-top: 1px solid var(--line);
  }
  .f-day {
    font-size: 0.75rem;
    color: var(--dim);
    text-transform: uppercase;
  }
  .f-icon {
    font-size: 1.3rem;
    line-height: 1.4;
  }
  .f-t {
    font-size: 0.85rem;
    color: var(--fg);
    font-variant-numeric: tabular-nums;
  }
</style>
