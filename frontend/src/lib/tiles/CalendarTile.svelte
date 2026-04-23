<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Event {
    id: string;
    title: string;
    start: string; // ISO
    end?: string;
    location?: string;
  }

  interface CalProps {
    calendar_id?: string;
    count?: number;
    demo?: Event[];
  }

  interface Props {
    id: string;
    props?: CalProps;
  }

  let { id, props = {} }: Props = $props();
  const count = $derived(Math.min(Math.max(props.count ?? 6, 1), 12));
  const events: Event[] = $derived(
    props.demo ?? [
      { id: '1', title: 'Standup', start: new Date(Date.now() + 30 * 60 * 1000).toISOString() },
      {
        id: '2',
        title: 'Design review',
        start: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
        location: 'Meet'
      },
      {
        id: '3',
        title: '1:1 w/ manager',
        start: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()
      }
    ]
  );

  function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  function minutesUntil(iso: string): number {
    return Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  }
</script>

<BaseTile {id} type="calendar" label="Calendar">
  <div class="cal" data-testid="calendar">
    <h4 class="cal-title mono">Upcoming</h4>
    <ul>
      {#each events.slice(0, count) as ev (ev.id)}
        {@const mins = minutesUntil(ev.start)}
        <li class="ev" data-testid="cal-event">
          <span class="when mono">{formatTime(ev.start)}</span>
          <span class="title">{ev.title}</span>
          {#if ev.location}
            <span class="loc">· {ev.location}</span>
          {/if}
          <span class="soon" class:imminent={mins <= 10} class:warn={mins <= 30 && mins > 10}>
            in {mins}m
          </span>
        </li>
      {/each}
    </ul>
  </div>
</BaseTile>

<style>
  .cal {
    display: flex;
    flex-direction: column;
    gap: var(--gap-sm);
    width: 100%;
    height: 100%;
  }
  .cal-title {
    color: var(--dim);
    font-size: 10px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ev {
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 13px;
    padding: 4px 0;
    border-bottom: 1px solid var(--line);
  }
  .when {
    color: var(--accent);
    font-size: 11px;
    min-width: 44px;
  }
  .title {
    flex: 1;
    color: var(--fg);
  }
  .loc {
    color: var(--dim);
    font-size: 11px;
  }
  .soon {
    color: var(--dim);
    font-size: 11px;
    font-family: var(--font-mono);
  }
  .soon.warn {
    color: var(--warn);
  }
  .soon.imminent {
    color: var(--bad);
  }
</style>
