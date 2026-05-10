<script lang="ts">
  /**
   * Horizontal KPI strip — single h=1 row of small stat blocks pulling
   * live values from HA sensors. Editorial typography: Fraunces label
   * uppercase + small caps, gold value + tiny secondary caption.
   *
   * Each KPI = { entityId, label, suffix?, captionEntityId?,
   *              captionFormat? } via props.kpis.
   * Caption can be either a static string OR another HA entity (e.g.
   * a reset-time timestamp formatted as a relative countdown).
   */
  import { onDestroy, onMount, untrack } from 'svelte';
  import BaseTile from './BaseTile.svelte';
  import { watchEntity, type HaEntity } from '$lib/ha/entity.js';

  type ValueFormat = 'number' | 'relative' | 'percent_pace';
  type CaptionFormat = 'relative' | 'percent_pace' | 'plain';

  interface KpiSpec {
    entityId: string;
    label: string;
    suffix?: string;
    valueFormat?: ValueFormat;
    captionEntityId?: string;
    captionFormat?: CaptionFormat;
    captionPrefix?: string;
  }

  interface Props {
    id: string;
    props?: { kpis?: KpiSpec[] };
  }
  let { id, props = {} }: Props = $props();

  const kpis = $derived<KpiSpec[]>(props.kpis ?? []);

  // Per-KPI watcher map: entity id → store + cleanup. Includes both
  // the primary value entity AND any caption entity.
  //
  // Watcher setup happens in onMount (NOT $effect) — subscribe fires
  // synchronously on connect and writes `entities`; if that ran inside
  // a $effect that read `kpis`, the write would trigger the effect to
  // re-run, recreate watchers, fire again → infinite loop →
  // ERR_INSUFFICIENT_RESOURCES from too many in-flight fetches.
  let entities = $state<Record<string, HaEntity | null>>({});
  let stops: Array<() => void> = [];

  onMount(() => {
    // Snapshot kpi list at mount time. Currently this card's kpi list
    // comes from layout JSON props which are stable for the tile's
    // lifetime; if that changes we'll need a smarter watcher manager.
    const snapshot = untrack(() => kpis);
    const ids = new Set<string>();
    for (const k of snapshot) {
      ids.add(k.entityId);
      if (k.captionEntityId) ids.add(k.captionEntityId);
    }
    for (const id of ids) {
      const w = watchEntity(id, 60_000);
      const unsub = w.store.subscribe((e) => {
        entities = { ...entities, [id]: e };
      });
      stops.push(() => {
        unsub();
        w.stop();
      });
    }
  });

  onDestroy(() => {
    for (const stop of stops) stop();
    stops = [];
  });

  function fmtRelative(iso: string): string {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return iso;
    const ms = t - Date.now();
    if (ms <= 0) return 'now';
    const min = Math.round(ms / 60_000);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    const rest = min % 60;
    if (hr < 24) {
      return rest === 0 ? `${hr}h` : `${hr}h ${rest}m`;
    }
    const days = Math.floor(hr / 24);
    return `${days}d`;
  }

  function fmtValue(spec: KpiSpec): string {
    const e = entities[spec.entityId];
    if (!e) return '—';
    const raw = e.state;
    if (raw === 'unknown' || raw === 'unavailable' || raw == null) return '—';
    if (spec.valueFormat === 'relative') return fmtRelative(raw);
    if (spec.valueFormat === 'percent_pace') {
      const n = Number(raw);
      if (!Number.isFinite(n)) return raw;
      const sign = n >= 0 ? '+' : '';
      return `${sign}${Math.round(n)}%`;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw;
    const rounded = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
    return `${rounded}${spec.suffix ?? ''}`;
  }

  function fmtCaption(spec: KpiSpec): string {
    if (!spec.captionEntityId) return '';
    const e = entities[spec.captionEntityId];
    if (!e) return '';
    const raw = e.state;
    if (raw === 'unknown' || raw === 'unavailable' || raw == null) return '';

    const prefix = spec.captionPrefix ?? '';
    if (spec.captionFormat === 'relative') {
      const t = new Date(raw).getTime();
      if (!Number.isFinite(t)) return `${prefix}${raw}`;
      const ms = t - Date.now();
      if (ms <= 0) return `${prefix}now`;
      const min = Math.round(ms / 60_000);
      if (min < 60) return `${prefix}${min}m`;
      const hr = Math.floor(min / 60);
      const rest = min % 60;
      if (hr < 24) {
        return rest === 0 ? `${prefix}${hr}h` : `${prefix}${hr}h ${rest}m`;
      }
      const days = Math.floor(hr / 24);
      return `${prefix}${days}d`;
    }
    if (spec.captionFormat === 'percent_pace') {
      const n = Number(raw);
      if (!Number.isFinite(n)) return `${prefix}${raw}`;
      const sign = n >= 0 ? '+' : '';
      return `${prefix}${sign}${Math.round(n)}%`;
    }
    return `${prefix}${raw}`;
  }
</script>

<BaseTile {id} type="kpi_strip" chromeless={true} label="KPIs">
  <div class="strip" data-testid="kpi-strip">
    {#if kpis.length === 0}
      <div class="empty">— no kpis configured —</div>
    {:else}
      {#each kpis as k (k.entityId)}
        <div class="kpi">
          <div class="lbl">{k.label}</div>
          <div class="val">{fmtValue(k)}</div>
          {#if k.captionEntityId}
            <div class="cap">{fmtCaption(k)}</div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</BaseTile>

<style>
  .strip {
    height: 100%;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0.7rem;
    gap: 0.8rem;
    color: var(--fg);
    font-family: 'Fraunces', Georgia, serif;
    border-bottom: 1px solid var(--line);
    overflow: hidden;
  }
  .empty {
    flex: 1;
    text-align: center;
    font-style: italic;
    color: var(--dimmer);
    font-size: 0.7rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  .kpi {
    display: grid;
    grid-template-columns: auto auto;
    grid-template-rows: auto auto;
    column-gap: 0.5rem;
    align-items: baseline;
    min-width: 0;
  }
  .lbl {
    grid-row: 1;
    grid-column: 1;
    font-style: italic;
    font-size: 0.55rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--dim);
    line-height: 1;
  }
  .val {
    grid-row: 1 / span 2;
    grid-column: 2;
    align-self: center;
    font-style: italic;
    font-weight: 700;
    font-size: 1.4rem;
    color: var(--accent);
    font-feature-settings: 'tnum';
    line-height: 1;
  }
  .cap {
    grid-row: 2;
    grid-column: 1;
    font-style: italic;
    font-size: 0.55rem;
    letter-spacing: 0.06em;
    color: var(--dimmer);
    line-height: 1.2;
    margin-top: 0.15rem;
    font-feature-settings: 'tnum';
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
