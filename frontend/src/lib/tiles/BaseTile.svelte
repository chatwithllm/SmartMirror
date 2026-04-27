<script lang="ts">
  /**
   * Shared tile chrome. Every Tile type renders its content inside this
   * wrapper so theme tokens, focus state, and resize hooks stay central.
   */
  import { focusedTile, fullscreenTile } from '$lib/gesture/router.js';

  interface Props {
    id: string;
    type: string;
    label?: string;
    /** Immersive tiles drop the border + padding so content fills the cell. */
    chromeless?: boolean;
    children?: import('svelte').Snippet;
  }

  let { id, type, label, chromeless = false, children }: Props = $props();

  // Subscribe to gesture-driven focus + fullscreen so every tile
  // reflects state without each implementation having to remember.
  const focused = $derived($focusedTile === id);
  const fullscreen = $derived($fullscreenTile === id);
</script>

<section
  class="tile"
  class:chromeless
  class:fullscreen
  data-tile-id={id}
  data-tile-type={type}
  data-focused={focused ? 'true' : undefined}
  data-fullscreen={fullscreen ? 'true' : undefined}
  aria-label={label ?? type}
>
  {#if children}
    {@render children()}
  {/if}
</section>

<style>
  .tile {
    position: relative;
    width: 100%;
    height: 100%;
    background: var(--panel);
    color: var(--fg);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    /* Generous horizontal padding so right-aligned text (host percentages,
     * counts, timestamps) never sits flush against the tile border. */
    padding: var(--gap-md) calc(var(--gap-md) + 0.5rem);
    overflow: hidden;
    transition:
      border-color var(--motion-fast) ease,
      transform var(--motion-med) ease;
  }

  /* Focus styling is driven externally by the gesture subsystem (Phase 13). */
  :global(.tile[data-focused='true']) {
    border-color: var(--accent);
    transform: scale(1.03);
  }

  /* Fullscreen — gesture-driven takeover of the stage. Pulls the tile
   * out of the grid visually without actually rewriting layout. */
  .tile.fullscreen {
    position: fixed;
    inset: 0;
    z-index: 50;
    border-radius: 0;
    transform: none;
  }

  /* Immersive mode — for fill-the-screen content like aquarium stream. */
  .tile.chromeless {
    background: #000;
    border: 0;
    border-radius: 0;
    padding: 0;
  }
</style>
