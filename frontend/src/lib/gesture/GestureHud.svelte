<script lang="ts">
  import { onDestroy } from 'svelte';
  import { gestureHud } from './router.js';

  let current = $state<{ gesture: string; confidence?: number; seq: number } | null>(
    null
  );
  let visible = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const h = $gestureHud;
    if (!h) return;
    current = { gesture: h.gesture, confidence: h.confidence, seq: h.seq };
    visible = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      visible = false;
    }, 1400);
  });

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });
</script>

{#if visible && current}
  {#key current.seq}
    <div class="gesture-hud" data-testid="gesture-hud" role="status">
      <span class="glyph" aria-hidden="true">✋</span>
      <span class="name">{current.gesture}</span>
      {#if typeof current.confidence === 'number'}
        <span class="conf">{Math.round(current.confidence * 100)}%</span>
      {/if}
    </div>
  {/key}
{/if}

<style>
  .gesture-hud {
    position: absolute;
    bottom: 76px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: var(--panel);
    color: var(--fg);
    border: 1px solid var(--accent, var(--line));
    border-radius: 999px;
    font-family: var(--font-mono);
    font-size: 15px;
    line-height: 1;
    pointer-events: none;
    white-space: nowrap;
    animation: gesture-pop 1.4s ease-out forwards;
  }
  .glyph {
    font-size: 18px;
  }
  .name {
    letter-spacing: 0.03em;
  }
  .conf {
    color: var(--dim, var(--fg));
    font-size: 12px;
    opacity: 0.8;
  }
  @keyframes gesture-pop {
    0% {
      opacity: 0;
      transform: translateX(-50%) translateY(6px) scale(0.92);
    }
    12% {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(1);
    }
    80% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
</style>
