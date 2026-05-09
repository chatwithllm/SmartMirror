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

  interface CalEvent { summary: string; start: string }

  const tomorrowEvents = $derived.by((): CalEvent[] => {
    if (!entity) return [];
    const a = entity.attributes as { events?: CalEvent[] };
    if (!Array.isArray(a.events)) return [];
    const tomorrowStart = new Date();
    tomorrowStart.setHours(0, 0, 0, 0);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const dayAfter = new Date(tomorrowStart);
    dayAfter.setDate(dayAfter.getDate() + 1);
    return a.events
      .filter((e) => {
        const s = new Date(e.start);
        return s >= tomorrowStart && s < dayAfter;
      })
      .sort((x, y) => +new Date(x.start) - +new Date(y.start));
  });

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
</script>

<section class="cal-tom">
  <header class="kicker">— Tomorrow —</header>
  {#if tomorrowEvents.length === 0}
    <p class="empty">Tomorrow's clear</p>
  {:else}
    <ul>
      {#each tomorrowEvents.slice(0, 4) as e (e.start)}
        <li>
          <span class="t">{fmtTime(e.start)}</span>
          <span class="s">{e.summary}</span>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="rule" aria-hidden="true"></div>
</section>

<style>
  .cal-tom {
    height: 100%;
    padding: 0.6rem 0.8rem 0.7rem;
    display: flex;
    flex-direction: column;
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
  .empty { font-style: italic; color: var(--dim); font-size: 1.05rem; margin: auto 0; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.45rem; flex: 1; }
  li { display: grid; grid-template-columns: 5rem 1fr; gap: 0.7rem; align-items: baseline; }
  .t { font-style: italic; font-size: 0.85rem; color: var(--accent); font-feature-settings: 'tnum'; }
  .s { font-style: italic; font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rule { position: absolute; left: 0.8rem; right: 0.8rem; bottom: 0; height: 1px; background: var(--line); }
</style>
