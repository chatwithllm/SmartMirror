<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  interface Props {
    id: string;
    isActive: boolean;
    props?: { endpoint?: string };
  }
  let { isActive, props = {} }: Props = $props();
  const endpoint = $derived(props.endpoint ?? '/api/grocery/list');

  interface GroceryItem { name: string; qty?: number; store?: string }
  let items = $state<GroceryItem[]>([]);
  let failed = $state(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function load() {
    try {
      const r = await fetch(endpoint, { cache: 'no-store' });
      if (!r.ok) { failed = true; return; }
      const j = (await r.json()) as { items?: GroceryItem[] };
      items = j.items ?? [];
      failed = false;
    } catch {
      failed = true;
    }
  }

  onMount(() => {
    if (!isActive) return;
    void load();
    timer = setInterval(load, 30_000);
  });
  onDestroy(() => { if (timer) clearInterval(timer); });
</script>

<section class="grocery">
  <header class="kicker">— Pantry —</header>
  {#if failed}
    <p class="fail">— card unavailable —</p>
  {:else if items.length === 0}
    <p class="empty">Pantry's stocked</p>
  {:else}
    <ul>
      {#each items.slice(0, 6) as it, i (i)}
        <li>
          <span class="n">{it.name}</span>
          {#if it.store}<span class="st">{it.store}</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}
  <div class="rule" aria-hidden="true"></div>
</section>

<style>
  .grocery { height: 100%; padding: 0.6rem 0.8rem 0.7rem; display: flex; flex-direction: column; color: var(--fg); font-family: 'Fraunces', Georgia, serif; position: relative; }
  .kicker { font-style: italic; font-size: 0.6rem; letter-spacing: 0.28em; text-transform: uppercase; color: var(--dim); margin-bottom: 0.5rem; }
  .empty, .fail { font-style: italic; color: var(--dim); font-size: 1.05rem; margin: auto 0; }
  .fail { color: var(--dimmer); }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; flex: 1; }
  li { display: flex; justify-content: space-between; align-items: baseline; font-style: italic; font-size: 0.95rem; }
  .st { color: var(--accent); font-size: 0.7rem; letter-spacing: 0.18em; text-transform: uppercase; }
  .rule { position: absolute; left: 0.8rem; right: 0.8rem; bottom: 0; height: 1px; background: var(--line); }
</style>
