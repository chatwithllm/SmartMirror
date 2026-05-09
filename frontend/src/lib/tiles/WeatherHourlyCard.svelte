<script lang="ts">
  import { onDestroy } from 'svelte';
  import { watchEntity, type HaEntity } from '$lib/ha/entity.js';

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

  interface ForecastHour { datetime: string; temperature: number; condition: string; precipitation_probability?: number }

  const hours = $derived.by((): ForecastHour[] => {
    if (!entity) return [];
    const a = entity.attributes as { forecast?: ForecastHour[]; temperature_unit?: string };
    if (!Array.isArray(a.forecast)) return [];
    return a.forecast.slice(0, 6);
  });

  const fmtT = (c: number) =>
    units === 'imperial' ? `${Math.round((c * 9) / 5 + 32)}°` : `${Math.round(c)}°`;
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
  li { display: grid; grid-template-columns: 3rem 3rem 1fr; gap: 0.7rem; align-items: baseline; font-style: italic; font-size: 0.92rem; }
  .hr { color: var(--dim); font-feature-settings: 'tnum'; }
  .t { color: var(--accent); font-weight: 700; font-feature-settings: 'tnum'; }
  .c { color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rule { position: absolute; left: 0.8rem; right: 0.8rem; bottom: 0; height: 1px; background: var(--line); }
</style>
