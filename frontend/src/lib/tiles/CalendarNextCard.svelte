<script lang="ts">
  import { onDestroy } from 'svelte';
  import { watchEntity, type HaEntity } from '$lib/ha/entity.js';

  interface Props {
    id: string;
    isActive: boolean;
    props?: { entityId?: string };
  }
  let { isActive, props = {} }: Props = $props();
  const entityId = $derived(props.entityId ?? 'calendar.palakurla4340_gmail_com');

  let entity = $state<HaEntity | null>(null);
  let stop: (() => void) | null = null;
  $effect(() => {
    stop?.();
    entity = null;
    if (!isActive) return;
    const w = watchEntity(entityId, 60_000);
    const unsub = w.store.subscribe((e) => (entity = e));
    stop = () => {
      unsub();
      w.stop();
    };
  });
  onDestroy(() => stop?.());

  interface CalEvent { summary: string; start: string; end?: string }

  const next = $derived.by((): CalEvent | null => {
    if (!entity) return null;
    const a = entity.attributes as { events?: CalEvent[]; message?: string; start_time?: string };
    if (Array.isArray(a.events)) {
      const now = new Date();
      const future = a.events
        .filter((e) => new Date(e.start) >= now)
        .sort((x, y) => +new Date(x.start) - +new Date(y.start));
      if (future[0]) return future[0];
    }
    if (a.message && a.start_time) {
      return { summary: a.message, start: a.start_time };
    }
    return null;
  });

  const countdown = $derived.by((): string => {
    if (!next) return '';
    const ms = +new Date(next.start) - Date.now();
    if (ms < 0) return 'now';
    const min = Math.round(ms / 60_000);
    if (min < 60) return `in ${min} min`;
    const hr = Math.floor(min / 60);
    const rest = min % 60;
    return rest === 0 ? `in ${hr}h` : `in ${hr}h ${rest}m`;
  });
</script>

<section class="cal-next">
  <header class="kicker">— Next Up —</header>
  {#if !next}
    <p class="empty">Nothing scheduled</p>
  {:else}
    <p class="title">{next.summary}</p>
    <p class="when">{countdown}</p>
  {/if}
  <div class="rule" aria-hidden="true"></div>
</section>

<style>
  .cal-next {
    height: 100%;
    padding: 0.6rem 0.8rem 0.7rem;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    color: var(--fg);
    font-family: 'Fraunces', Georgia, serif;
    position: relative;
  }
  .kicker {
    font-style: italic;
    font-size: 0.6rem;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--dim);
    margin-bottom: 0.5rem;
  }
  .empty {
    font-style: italic;
    color: var(--dim);
    font-size: 1.05rem;
  }
  .title {
    font-style: italic;
    font-weight: 700;
    font-size: clamp(1.4rem, 3vw, 2rem);
    line-height: 1.1;
    margin: 0 0 0.3rem;
  }
  .when {
    font-style: italic;
    color: var(--accent);
    font-size: 0.95rem;
    letter-spacing: 0.06em;
    margin: 0;
  }
  .rule {
    position: absolute;
    left: 0.8rem;
    right: 0.8rem;
    bottom: 0;
    height: 1px;
    background: var(--line);
  }
</style>
