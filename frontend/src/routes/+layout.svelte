<script lang="ts">
  import '$lib/styles/root.css';
  import { onMount } from 'svelte';

  interface Props {
    data: { haUrl: string; haToken: string; mirrorLanUrl?: string };
    children?: import('svelte').Snippet;
  }

  let { data, children }: Props = $props();

  onMount(() => {
    if (typeof window === 'undefined') return;
    // Seed globals so child components (e.g. YouTubeTile's QR) can
    // read LAN-routable URL / HA creds without prop drilling.
    (window as any).__HA_URL__ = data.haUrl || undefined;
    (window as any).__HA_TOKEN__ = data.haToken || undefined;
    (window as any).__MIRROR_LAN_URL__ = data.mirrorLanUrl || undefined;
  });
</script>

{#if children}
  {@render children()}
{/if}
