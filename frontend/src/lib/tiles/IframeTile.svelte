<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface IframeProps {
    url?: string;
    sandbox?: string;
    refresh_seconds?: number;
  }

  interface Props {
    id: string;
    props?: IframeProps;
  }

  let { id, props = {} }: Props = $props();

  const url = $derived(props.url ?? '');
  const sandbox = $derived(props.sandbox ?? 'allow-scripts allow-same-origin');
</script>

<BaseTile {id} type="iframe" label="Iframe">
  {#if url}
    <iframe
      class="frame"
      title={`iframe-${id}`}
      src={url}
      sandbox={sandbox}
      referrerpolicy="no-referrer"
      loading="lazy"
      data-testid="iframe-tile"
    ></iframe>
  {:else}
    <div class="empty mono" data-testid="iframe-empty">no url</div>
  {/if}
</BaseTile>

<style>
  .frame {
    width: 100%;
    height: 100%;
    border: 0;
    border-radius: calc(var(--radius-md) - 2px);
    background: var(--panel-2);
  }
  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--dim);
    font-size: 0.85rem;
  }
</style>
