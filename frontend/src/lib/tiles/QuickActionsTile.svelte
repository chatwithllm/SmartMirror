<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Action {
    id: string;
    label: string;
    icon?: string;
    service?: string; // HA service like "light.turn_on"
    entity_id?: string;
  }

  interface Props {
    id: string;
    props?: { actions?: Action[] };
  }

  let { id, props = {} }: Props = $props();
  const actions: Action[] = $derived(
    props.actions ?? [
      { id: 'all-off', label: 'All off', icon: '⏻' },
      { id: 'night', label: 'Good night', icon: '🌙' },
      { id: 'movie', label: 'Movie time', icon: '🎬' },
      { id: 'alarm-on', label: 'Arm away', icon: '🔒' },
      { id: 'garage', label: 'Garage', icon: '🚪' },
      { id: 'coffee', label: 'Coffee', icon: '☕' }
    ]
  );

  let flashing = $state<string | null>(null);

  function fire(a: Action) {
    flashing = a.id;
    try {
      window.dispatchEvent(
        new CustomEvent('mirror:quick_action', { detail: { id, action: a } })
      );
    } catch {
      /* ignore */
    }
    setTimeout(() => (flashing = null), 500);
  }
</script>

<BaseTile {id} type="quick_actions" label="Quick">
  <div class="qa" data-testid="quick-actions">
    <h4 class="mono">Quick actions</h4>
    <div class="grid">
      {#each actions as a (a.id)}
        <button
          class:flash={flashing === a.id}
          onclick={() => fire(a)}
          data-testid={`qa-${a.id}`}
        >
          <span class="icon">{a.icon ?? '•'}</span>
          <span class="label">{a.label}</span>
        </button>
      {/each}
    </div>
  </div>
</BaseTile>

<style>
  .qa {
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
    grid-template-columns: repeat(auto-fill, minmax(6.15rem, 1fr));
    gap: 6px;
  }
  button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    color: var(--fg);
    padding: 10px 6px;
    cursor: pointer;
    transition:
      background var(--motion-fast) ease,
      transform var(--motion-fast) ease;
  }
  button:hover {
    background: var(--panel);
  }
  button.flash {
    background: var(--accent);
    color: #000;
    transform: scale(0.98);
  }
  .icon {
    font-size: 1.3rem;
  }
  .label {
    font-size: 0.75rem;
    font-family: var(--font-mono);
  }
</style>
