<script lang="ts">
  /**
   * Section host. Reads its section's channel state and mounts the
   * active card. Listens for $currentPhase changes to apply phase
   * default and runs a 30s sweep to expire overrides.
   */
  import { onDestroy, onMount, setContext } from 'svelte';
  import { get } from 'svelte/store';
  import BaseTile from './BaseTile.svelte';
  import type { CardId, ChannelConfig, SectionId } from '$lib/cards/types.js';
  import { createChannelStore, type ChannelHandle } from '$lib/sections/channel.js';
  import { registerSection, unregisterSection } from '$lib/sections/registry.js';
  import { setSectionEmpty, SECTION_EMPTY_CTX } from '$lib/sections/empty.js';
  import { cardFor } from '$lib/cards/registry.js';
  import { currentPhase } from '$lib/phase/clock.js';
  import { watchEntity, type HaEntity } from '$lib/ha/entity.js';

  interface Props {
    id: string;
    props?: {
      sectionId?: SectionId;
      channelConfig?: ChannelConfig;
      // Per-card props passed through to whichever card is active.
      // Keyed by CardId. Lets the layout JSON inject e.g.
      // cardProps.camera_grid.cameras = [...] without each card needing
      // its own bespoke layout shape.
      cardProps?: Record<string, Record<string, unknown>>;
    };
  }
  let { id, props = {} }: Props = $props();

  const sectionId = $derived(props.sectionId ?? (id as SectionId));
  const cfg = $derived(props.channelConfig);
  const cardProps = $derived(props.cardProps ?? {});

  // Expose an empty-state hook to the active card. The card calls
  // markEmpty(true|false); we forward to the shared store keyed by
  // this section's id. Using a closure over the $derived sectionId
  // means a (theoretical) section-id swap still routes correctly.
  setContext(SECTION_EMPTY_CTX, (isEmpty: boolean) => {
    setSectionEmpty(sectionId, isEmpty);
  });

  let handle: ChannelHandle | null = $state(null);
  let sweep: ReturnType<typeof setInterval> | null = null;
  let pinStop: (() => void) | null = null;

  // HA helper id derived from section id, e.g. section-2 → mirror_section_2.
  function pinEntityId(sid: string): string {
    const slug = sid.replace(/[^a-z0-9_]+/gi, '_');
    return `input_select.mirror_${slug}_channel`;
  }

  function parsePinState(s: string | undefined | null, pool: CardId[]): CardId | null {
    const v = (s ?? '').trim().toLowerCase();
    if (!v || v === 'auto' || v === 'unknown' || v === 'unavailable') return null;
    // Only accept values that exist in the pool — guards against typos
    // or stale options the layout no longer supports.
    return (pool as readonly string[]).includes(v) ? (v as CardId) : null;
  }

  onMount(() => {
    if (!cfg) return;
    handle = createChannelStore(sectionId, cfg, get(currentPhase));
    registerSection(sectionId, handle);

    const unsubPhase = currentPhase.subscribe((p) => handle?.applyPhaseDefault(p));

    sweep = setInterval(() => handle?.tickOverrides(get(currentPhase)), 30_000);

    // Watch the per-section HA input_select. State changes flip
    // pinnedCardId in the channel store — phase rules now act only as
    // the "auto" fallback.
    const watcher = watchEntity(pinEntityId(sectionId), 5_000);
    const unsubPin = watcher.store.subscribe((e: HaEntity | null) => {
      if (!handle) return;
      const pinned = parsePinState(e?.state, cfg.pool);
      handle.setPin(pinned, get(currentPhase));
    });
    pinStop = () => {
      unsubPin();
      watcher.stop();
    };

    return () => {
      unsubPhase();
    };
  });

  onDestroy(() => {
    unregisterSection(sectionId);
    if (sweep) clearInterval(sweep);
    pinStop?.();
    pinStop = null;
    // Clear stale empty=true so a torn-down section doesn't keep the
    // grid budget over totalRows on remount.
    setSectionEmpty(sectionId, false);
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
  {#if entry && cardId}
    {@const Component = entry.component}
    <Component
      id={id}
      phase={$currentPhase}
      isActive={true}
      props={cardProps[cardId] ?? {}}
    />
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
