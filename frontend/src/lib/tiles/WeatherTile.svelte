<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface WeatherProps {
    units?: 'metric' | 'imperial';
    days?: number;
    location?: string;
    // Phase 03 stub: static demo data so the tile renders something when HA
    // hasn't wired a real weather entity yet. Phase 04 replaces with a
    // state_changed subscription.
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

  function fmt(tempC: number) {
    if (units === 'imperial') return `${Math.round((tempC * 9) / 5 + 32)}°`;
    return `${Math.round(tempC)}°`;
  }
</script>

<BaseTile {id} type="weather" label="Weather">
  <div class="wx" data-testid="weather">
    <div class="current">
      <div class="temp" data-testid="weather-temp">{fmt(demo.tempC)}</div>
      <div class="cond">{demo.condition}</div>
      <div class="hilo mono">H {fmt(demo.high)} · L {fmt(demo.low)}</div>
    </div>
    {#if demo.forecast?.length}
      <div class="forecast">
        {#each demo.forecast.slice(0, days) as f (f.day)}
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
    font-size: 14px;
    color: var(--dim);
    letter-spacing: 0.02em;
  }
  .hilo {
    font-size: 12px;
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
    font-size: 10px;
    color: var(--dim);
    text-transform: uppercase;
  }
  .f-icon {
    font-size: 18px;
    line-height: 1.4;
  }
  .f-t {
    font-size: 12px;
    color: var(--fg);
    font-variant-numeric: tabular-nums;
  }
</style>
