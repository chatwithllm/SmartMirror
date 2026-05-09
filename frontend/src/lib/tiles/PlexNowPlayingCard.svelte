<script lang="ts">
  /**
   * Plex full-takeover card. Wraps the existing PlexPlayerTile but
   * sized to fill the entire mirror minus the masthead. Mounted by
   * +page.svelte when plexActive is true; never mounted via the
   * section channel registry.
   */
  import PlexPlayerTile from './PlexPlayerTile.svelte';

  interface Props {
    id: string;
    props?: Record<string, unknown>;
  }
  let { id, props = {} }: Props = $props();
</script>

<div class="plex-fullscreen">
  <PlexPlayerTile {id} props={props as never} />
</div>

<style>
  .plex-fullscreen {
    position: relative;
    width: 100%;
    height: 100%;
    background: #000;
  }
  .plex-fullscreen :global(.tile) {
    border: 0 !important;
    border-radius: 0 !important;
    padding: 0 !important;
    background: #000 !important;
  }
</style>
