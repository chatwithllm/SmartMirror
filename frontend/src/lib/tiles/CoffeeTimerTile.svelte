<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import BaseTile from './BaseTile.svelte';

  interface Props {
    id: string;
    props?: { method?: 'v60' | 'aeropress' | 'french'; totalSeconds?: number };
  }

  let { id, props = {} }: Props = $props();
  const total = $derived(props.totalSeconds ?? 240);

  type CoffeeState = 'idle' | 'running' | 'paused' | 'done';
  let phase: CoffeeState = $state('idle');
  let elapsed = $state(0);
  let timer: ReturnType<typeof setInterval> | null = null;

  function tickStart() {
    timer = setInterval(() => {
      elapsed += 1;
      if (elapsed >= total) {
        phase = 'done';
        clearInterval(timer!);
        timer = null;
      }
    }, 1000);
  }

  function start() {
    elapsed = 0;
    phase = 'running';
    tickStart();
  }
  function pause() {
    if (timer) clearInterval(timer);
    timer = null;
    phase = 'paused';
  }
  function resume() {
    phase = 'running';
    tickStart();
  }
  function reset() {
    if (timer) clearInterval(timer);
    timer = null;
    elapsed = 0;
    phase = 'idle';
  }

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });
  onMount(() => {
    void 0;
  });

  function mmss(s: number) {
    const m = Math.floor(s / 60);
    const sc = (s % 60).toString().padStart(2, '0');
    return `${m}:${sc}`;
  }
</script>

<BaseTile {id} type="coffee_timer" label="Pour-over">
  <div class="ct" data-testid="coffee">
    <h4 class="mono">{props.method ?? 'v60'} · {mmss(total)}</h4>
    <div class="time mono" data-testid="coffee-time">{mmss(elapsed)} / {mmss(total)}</div>
    <div class="bar"><div class="fill" style:width="{(elapsed / total) * 100}%"></div></div>
    <div class="controls">
      {#if phase === 'idle' || phase === 'done'}
        <button onclick={start} data-testid="coffee-start">Start</button>
      {:else if phase === 'running'}
        <button onclick={pause} data-testid="coffee-pause">Pause</button>
      {:else}
        <button onclick={resume} data-testid="coffee-resume">Resume</button>
      {/if}
      <button onclick={reset} data-testid="coffee-reset">Reset</button>
    </div>
  </div>
</BaseTile>

<style>
  .ct {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    height: 100%;
    justify-content: center;
    align-items: center;
  }
  h4 {
    color: var(--dim);
    font-size: 0.75rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  .time {
    font-size: 2.2rem;
    color: var(--fg);
    font-variant-numeric: tabular-nums;
  }
  .bar {
    width: 100%;
    height: 4px;
    background: var(--panel-2);
    border-radius: 2px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--accent-2);
    transition: width 300ms linear;
  }
  .controls {
    display: flex;
    gap: 6px;
  }
  button {
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    color: var(--fg);
    padding: 4px 10px;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    cursor: pointer;
  }
</style>
