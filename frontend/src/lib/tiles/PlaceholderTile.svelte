<script lang="ts">
  /**
   * Empty section placeholder. Used while iterating on a layout —
   * shows the section name + a hint, no live data, no chrome work.
   * Replace with a real tile type once the section's content lands.
   */
  import BaseTile from './BaseTile.svelte';

  interface Props {
    id: string;
    props?: { label?: string; hint?: string };
  }
  let { id, props = {} }: Props = $props();
  const label = $derived(props.label ?? id);
  const hint = $derived(props.hint ?? 'empty section');
</script>

<BaseTile {id} type="placeholder" label={label}>
  <div class="ph">
    <div class="ph-label">{label}</div>
    <div class="ph-hint">{hint}</div>
  </div>
</BaseTile>

<style>
  .ph {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 0.4rem;
    color: var(--dim);
    text-align: center;
  }
  .ph-label {
    font-size: 1.1rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--fg);
    opacity: 0.85;
  }
  .ph-hint {
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    color: var(--dimmer);
  }
</style>
