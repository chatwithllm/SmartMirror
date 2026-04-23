<script lang="ts">
  import Grid from '$lib/grid/Grid.svelte';
  import type { Layout } from '$lib/layout/schema.js';

  // Phase 01: hard-coded layout. Phase 03 replaces with HA-driven store.
  const layout: Layout = {
    version: 1,
    mode: 'work',
    orientation: 'portrait',
    theme: 'minimal-dark',
    grid: { cols: 8, rows: 14, gap: 14 },
    transition: 'flip',
    tiles: [
      {
        id: 'clock',
        type: 'clock',
        x: 1,
        y: 5,
        w: 6,
        h: 4,
        props: { format: '24h', showSeconds: true, showDate: true }
      }
    ]
  };
</script>

<main class="stage">
  <Grid {layout} />
</main>

<style>
  .stage {
    width: 100%;
    height: 100vh;
    position: relative;
  }
</style>
