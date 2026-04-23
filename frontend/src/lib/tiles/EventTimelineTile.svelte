<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Event {
    id: string;
    camera: string;
    kind: string;
    when: string;
    ack?: boolean;
  }

  interface Props {
    id: string;
    props?: { demo?: Event[] };
  }

  let { id, props = {} }: Props = $props();

  let events = $state<Event[]>(
    props.demo ?? [
      { id: '1', camera: 'driveway', kind: 'person', when: '2m' },
      { id: '2', camera: 'backyard', kind: 'motion', when: '8m' },
      { id: '3', camera: 'porch', kind: 'package', when: '22m', ack: true },
      { id: '4', camera: 'driveway', kind: 'car', when: '1h' },
      { id: '5', camera: 'backyard', kind: 'animal', when: '3h' }
    ]
  );

  function ack(iid: string) {
    events = events.map((e) => (e.id === iid ? { ...e, ack: true } : e));
    try {
      window.dispatchEvent(new CustomEvent('mirror:event_ack', { detail: { id: iid } }));
    } catch {
      /* ignore */
    }
  }

  const unacked = $derived(events.filter((e) => !e.ack).length);
</script>

<BaseTile {id} type="event_timeline" label="Events">
  <div class="et" data-testid="event-timeline">
    <h4 class="mono">Events · {unacked} unack</h4>
    <ul>
      {#each events as e (e.id)}
        <li class:acked={e.ack} data-testid="event-row">
          <span class="cam mono">{e.camera}</span>
          <span class="kind">{e.kind}</span>
          <span class="when mono">{e.when}</span>
          {#if !e.ack}
            <button onclick={() => ack(e.id)} data-testid={`ack-${e.id}`}>ack</button>
          {:else}
            <span class="ok mono">✓</span>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
</BaseTile>

<style>
  .et {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    height: 100%;
  }
  h4 {
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
    gap: 3px;
  }
  li {
    display: grid;
    grid-template-columns: 72px 1fr 32px auto;
    gap: 8px;
    align-items: center;
    padding: 4px 0;
    border-bottom: 1px solid var(--line);
    font-size: 12px;
  }
  li.acked {
    opacity: 0.55;
  }
  .cam {
    color: var(--accent-2);
    font-size: 10px;
  }
  .kind {
    color: var(--fg);
  }
  .when {
    color: var(--dim);
    font-size: 11px;
    text-align: right;
  }
  button {
    background: var(--panel-2);
    border: 1px solid var(--line);
    color: var(--fg);
    border-radius: var(--radius-sm);
    padding: 2px 8px;
    font-family: var(--font-mono);
    font-size: 10px;
    cursor: pointer;
  }
  .ok {
    color: var(--ok);
  }
</style>
