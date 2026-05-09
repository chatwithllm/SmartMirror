<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  interface Props {
    id: string;
    isActive: boolean;
    props?: { endpoint?: string };
  }
  let { isActive, props = {} }: Props = $props();
  const endpoint = $derived(props.endpoint ?? '/api/immich/photo-of-day');

  interface PhotoOfDay { photoUrl: string; dateTaken?: string; location?: string; caption?: string }
  let photo = $state<PhotoOfDay | null>(null);
  let failed = $state(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function load() {
    try {
      const r = await fetch(endpoint, { cache: 'no-store' });
      if (!r.ok) { failed = true; return; }
      photo = (await r.json()) as PhotoOfDay;
      failed = false;
    } catch {
      failed = true;
    }
  }

  onMount(() => {
    if (!isActive) return;
    void load();
    timer = setInterval(load, 60 * 60 * 1000);
  });
  onDestroy(() => { if (timer) clearInterval(timer); });

  const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
</script>

<section class="photo">
  {#if failed || !photo}
    <div class="ph-fallback">
      <header class="kicker">— From the Archive —</header>
      <p class="empty">{failed ? '— card unavailable —' : 'Photo loading…'}</p>
    </div>
  {:else}
    <img src={photo.photoUrl} alt={photo.caption ?? 'Photo of the day'} />
    <div class="overlay">
      <header class="kicker">— From the Archive —</header>
      {#if photo.caption}<p class="cap">{photo.caption}</p>{/if}
      {#if photo.dateTaken || photo.location}
        <p class="meta">
          {fmtDate(photo.dateTaken)}{photo.dateTaken && photo.location ? ' · ' : ''}{photo.location ?? ''}
        </p>
      {/if}
    </div>
  {/if}
</section>

<style>
  .photo { height: 100%; width: 100%; position: relative; overflow: hidden; }
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ph-fallback {
    height: 100%; width: 100%;
    background: radial-gradient(circle at 30% 60%, #1a1714 0%, #000 100%);
    padding: 0.6rem 0.8rem 0.7rem;
    display: flex; flex-direction: column; justify-content: center;
    color: var(--fg); font-family: 'Fraunces', Georgia, serif;
  }
  .overlay {
    position: absolute; left: 0; right: 0; bottom: 0;
    background: linear-gradient(180deg, transparent, rgba(0,0,0,0.7) 60%, rgba(0,0,0,0.85));
    padding: 1.5rem 0.8rem 0.7rem;
    color: #fff;
    font-family: 'Fraunces', Georgia, serif;
  }
  .kicker { font-style: italic; font-size: 0.6rem; letter-spacing: 0.28em; text-transform: uppercase; color: var(--accent); margin-bottom: 0.4rem; }
  .empty { font-style: italic; color: var(--dim); font-size: 1.05rem; }
  .cap { font-style: italic; font-size: 0.95rem; margin: 0; }
  .meta { font-style: italic; font-size: 0.75rem; color: rgba(255,255,255,0.65); margin: 0.25rem 0 0; letter-spacing: 0.05em; }
</style>
