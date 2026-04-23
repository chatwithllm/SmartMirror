<script lang="ts">
  /**
   * Shared tile chrome. Every Tile type renders its content inside this
   * wrapper so theme tokens, focus state, and resize hooks stay central.
   */
  interface Props {
    id: string;
    type: string;
    label?: string;
    children?: import('svelte').Snippet;
  }

  let { id, type, label, children }: Props = $props();
</script>

<section
  class="tile"
  data-tile-id={id}
  data-tile-type={type}
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
    padding: var(--gap-md);
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
</style>
