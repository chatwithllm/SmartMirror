<script lang="ts">
  import '$lib/styles/root.css';
  import { onMount } from 'svelte';
  import StatsFooter from '$lib/StatsFooter.svelte';

  interface Props {
    data: { haUrl: string; haToken: string };
    children?: import('svelte').Snippet;
  }

  let { data, children }: Props = $props();

  onMount(() => {
    if (typeof window === 'undefined') return;
    // Seed globals so +page.svelte's onMount picks up HA creds without
    // prop-drilling them through every component.
    (window as any).__HA_URL__ = data.haUrl || undefined;
    (window as any).__HA_TOKEN__ = data.haToken || undefined;
  });
</script>

{#if children}
  {@render children()}
{/if}
<StatsFooter />
