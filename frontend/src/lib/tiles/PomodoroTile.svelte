<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import BaseTile from './BaseTile.svelte';
  import { pomodoro } from '$lib/stores/pomodoro.js';

  interface Props {
    id: string;
    props?: { minutes?: number };
  }

  let { id, props = {} }: Props = $props();
  const minutes = $derived(props.minutes ?? 25);

  let tick = $state(0);
  let timer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    timer = setInterval(() => (tick = Date.now()), 500);
  });
  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  const elapsed = $derived.by(() => {
    const s = $pomodoro;
    void tick;
    if (s.kind === 'running') return Date.now() - s.startedAt;
    if (s.kind === 'paused') return s.elapsedMs;
    return 0;
  });

  const duration = $derived.by(() => {
    const s = $pomodoro;
    if (s.kind === 'running' || s.kind === 'paused') return s.durationMs;
    return minutes * 60 * 1000;
  });

  const remainingMs = $derived(Math.max(0, duration - elapsed));
  const pct = $derived(Math.min(100, (elapsed / duration) * 100));

  function mmss(ms: number): string {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = (total % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
</script>

<BaseTile {id} type="pomodoro" label="Pomodoro">
  <div class="pd" data-testid="pomodoro">
    <div class="ring-wrap">
      <svg viewBox="0 0 100 100" class="ring" aria-hidden="true">
        <circle cx="50" cy="50" r="44" stroke="var(--line)" stroke-width="6" fill="none" />
        <circle
          cx="50"
          cy="50"
          r="44"
          stroke="var(--accent)"
          stroke-width="6"
          fill="none"
          stroke-dasharray={2 * Math.PI * 44}
          stroke-dashoffset={2 * Math.PI * 44 * (1 - pct / 100)}
          transform="rotate(-90 50 50)"
          stroke-linecap="round"
        />
      </svg>
      <div class="label mono" data-testid="pomo-timer">{mmss(remainingMs)}</div>
    </div>
    <div class="controls">
      {#if $pomodoro.kind === 'idle' || $pomodoro.kind === 'done'}
        <button
          onclick={() => pomodoro.start(minutes)}
          data-testid="pomo-start">Start {minutes}m</button
        >
      {:else if $pomodoro.kind === 'running'}
        <button onclick={() => pomodoro.pause()} data-testid="pomo-pause">Pause</button>
      {:else}
        <button onclick={() => pomodoro.resume()} data-testid="pomo-resume">Resume</button>
      {/if}
      <button onclick={() => pomodoro.reset()} data-testid="pomo-reset">Reset</button>
    </div>
  </div>
</BaseTile>

<style>
  .pd {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }
  .ring-wrap {
    position: relative;
    width: 100%;
    max-width: 140px;
    aspect-ratio: 1;
  }
  .ring {
    width: 100%;
    height: 100%;
  }
  .label {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.7rem;
    color: var(--fg);
    font-variant-numeric: tabular-nums;
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
