<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Sensor {
    id: string;
    name: string;
    room: string;
    state: 'open' | 'closed' | 'motion' | 'clear';
    battery?: number;
  }

  interface Props {
    id: string;
    props?: { demo?: Sensor[] };
  }

  let { id, props = {} }: Props = $props();

  const sensors: Sensor[] = $derived(
    props.demo ?? [
      { id: '1', name: 'Front door', room: 'entry', state: 'closed', battery: 82 },
      { id: '2', name: 'Back door', room: 'kitchen', state: 'closed', battery: 64 },
      { id: '3', name: 'Motion', room: 'hallway', state: 'clear', battery: 77 },
      { id: '4', name: 'Window LR', room: 'living', state: 'closed', battery: 41 },
      { id: '5', name: 'Motion', room: 'garage', state: 'motion', battery: 90 }
    ]
  );

  function pill(s: Sensor['state']) {
    return s === 'open' || s === 'motion' ? 'active' : 'quiet';
  }
</script>

<BaseTile {id} type="sensor_grid" label="Sensors">
  <div class="sg" data-testid="sensor-grid">
    <h4 class="mono">Sensors</h4>
    <div class="grid">
      {#each sensors as s (s.id)}
        <div class="cell">
          <div class="name">{s.name}</div>
          <div class="room mono">{s.room}</div>
          <span class="state mono p-{pill(s.state)}">{s.state}</span>
          {#if s.battery !== undefined}
            <span class="bat mono" class:low={s.battery < 25}>🔋{s.battery}%</span>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</BaseTile>

<style>
  .sg {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    height: 100%;
  }
  h4 {
    color: var(--dim);
    font-size: 0.75rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 6px;
  }
  .cell {
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .name {
    color: var(--fg);
    font-size: 0.8rem;
  }
  .room {
    color: var(--dim);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  .state {
    font-size: 0.75rem;
    border-radius: var(--radius-sm);
    padding: 2px 6px;
    width: fit-content;
  }
  .p-quiet {
    background: rgba(110, 231, 167, 0.14);
    color: var(--ok);
  }
  .p-active {
    background: rgba(255, 107, 107, 0.16);
    color: var(--bad);
  }
  .bat {
    font-size: 0.7rem;
    color: var(--dim);
  }
  .bat.low {
    color: var(--warn);
  }
</style>
