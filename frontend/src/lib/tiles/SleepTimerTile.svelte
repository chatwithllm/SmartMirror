<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import BaseTile from './BaseTile.svelte';

  interface Props {
    id: string;
    props?: { presetsMin?: number[] };
  }

  let { id, props = {} }: Props = $props();
  const presets = $derived(props.presetsMin ?? [15, 30, 45, 60, 90]);

  let endsAt = $state<number | null>(null);
  let tick = $state(Date.now());
  let timer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    timer = setInterval(() => {
      tick = Date.now();
      if (endsAt && Date.now() >= endsAt) {
        endsAt = null;
        try {
          window.dispatchEvent(new CustomEvent('mirror:sleep_fired', { detail: { id } }));
        } catch {
          /* ignore */
        }
      }
    }, 1000);
  });
  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  const remainingMs = $derived.by(() => {
    void tick;
    return endsAt ? Math.max(0, endsAt - Date.now()) : 0;
  });

  function set(mins: number) {
    endsAt = Date.now() + mins * 60 * 1000;
  }
  function cancel() {
    endsAt = null;
  }
  function mmss(ms: number) {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = (total % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
</script>

<BaseTile {id} type="sleep_timer" label="Sleep Timer">
  <div class="st" data-testid="sleep-timer">
    <h4 class="mono">Sleep timer</h4>
    {#if endsAt}
      <div class="remaining mono" data-testid="sleep-remaining">{mmss(remainingMs)}</div>
      <button class="cancel" onclick={cancel} data-testid="sleep-cancel">Cancel</button>
    {:else}
      <div class="presets">
        {#each presets as p (p)}
          <button onclick={() => set(p)} data-testid={`sleep-${p}`}>{p}m</button>
        {/each}
      </div>
    {/if}
  </div>
</BaseTile>

<style>
  .st {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;
  }
  h4 {
    color: var(--dim);
    font-size: 10px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  .remaining {
    font-size: 32px;
    color: var(--accent-2);
    font-variant-numeric: tabular-nums;
  }
  .presets {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: center;
  }
  button {
    background: var(--panel-2);
    border: 1px solid var(--line);
    color: var(--fg);
    border-radius: var(--radius-sm);
    padding: 4px 10px;
    font-family: var(--font-mono);
    font-size: 11px;
    cursor: pointer;
  }
  .cancel {
    color: var(--bad);
    border-color: var(--bad);
  }
</style>
