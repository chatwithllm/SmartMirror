<script lang="ts">
  /**
   * Section host. Reads its section's channel state and mounts the
   * active card. Listens for $currentPhase changes to apply phase
   * default and runs a 30s sweep to expire overrides.
   */
  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import BaseTile from './BaseTile.svelte';
  import type { ChannelConfig, SectionId } from '$lib/cards/types.js';
  import { createChannelStore, type ChannelHandle } from '$lib/sections/channel.js';
  import { cardFor } from '$lib/cards/registry.js';
  import { currentPhase } from '$lib/phase/clock.js';

  interface Props {
    id: string;
    props?: { sectionId?: SectionId; channelConfig?: ChannelConfig };
  }
  let { id, props = {} }: Props = $props();

  const sectionId = $derived(props.sectionId ?? (id as SectionId));
  const cfg = $derived(props.channelConfig);

  let handle: ChannelHandle | null = $state(null);
  let sweep: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    if (!cfg) return;
    handle = createChannelStore(sectionId, cfg, get(currentPhase));

    const unsubPhase = currentPhase.subscribe((p) => handle?.applyPhaseDefault(p));

    sweep = setInterval(() => handle?.tickOverrides(get(currentPhase)), 30_000);

    return () => {
      unsubPhase();
    };
  });

  onDestroy(() => {
    if (sweep) clearInterval(sweep);
  });

  // Reactive lookup of the active card. Subscribe to handle.state so
  // changes drive a re-render.
  let cardId = $state<string | undefined>(undefined);
  $effect(() => {
    if (!handle) return;
    const unsub = handle.state.subscribe((s) => (cardId = s.currentCardId));
    return unsub;
  });

  const entry = $derived(cardId ? cardFor(cardId as never) : undefined);
</script>

<BaseTile {id} type="section_host" chromeless={true} label={sectionId}>
  {#if entry}
    {@const Component = entry.component}
    <Component id={id} phase={$currentPhase} isActive={true} />
  {:else}
    <div class="ph">— loading —</div>
  {/if}
</BaseTile>

<style>
  .ph {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--dim);
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 0.7rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
</style>
