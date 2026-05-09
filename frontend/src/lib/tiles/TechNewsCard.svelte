<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  interface Props {
    id: string;
    isActive: boolean;
    props?: { endpoint?: string; n?: number };
  }
  let { isActive, props = {} }: Props = $props();
  const endpoint = $derived(props.endpoint ?? '/api/news/tech');
  const n = $derived(props.n ?? 5);

  interface NewsItem { title: string; url: string; score: number; by: string }
  let items = $state<NewsItem[]>([]);
  let failed = $state(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function load() {
    try {
      const r = await fetch(`${endpoint}?n=${n}`, { cache: 'no-store' });
      if (!r.ok) { failed = true; return; }
      const j = (await r.json()) as { items?: NewsItem[] };
      items = j.items ?? [];
      failed = false;
    } catch {
      failed = true;
    }
  }

  onMount(() => {
    if (!isActive) return;
    void load();
    timer = setInterval(load, 10 * 60 * 1000);
  });
  onDestroy(() => { if (timer) clearInterval(timer); });
</script>

<section class="news">
  <header class="kicker">— Tech Wire —</header>
  {#if failed}
    <p class="fail">— card unavailable —</p>
  {:else if items.length === 0}
    <p class="empty">News brief unavailable</p>
  {:else}
    <ol>
      {#each items as it, i (it.url)}
        <li>
          <span class="num">{i + 1}</span>
          <span class="title">{it.title}</span>
        </li>
      {/each}
    </ol>
  {/if}
  <div class="rule" aria-hidden="true"></div>
</section>

<style>
  .news { height: 100%; padding: 0.6rem 0.8rem 0.7rem; display: flex; flex-direction: column; color: var(--fg); font-family: 'Fraunces', Georgia, serif; position: relative; }
  .kicker { font-style: italic; font-size: 0.6rem; letter-spacing: 0.28em; text-transform: uppercase; color: var(--dim); margin-bottom: 0.5rem; }
  .empty, .fail { font-style: italic; color: var(--dim); font-size: 1.05rem; margin: auto 0; }
  .fail { color: var(--dimmer); }
  ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; flex: 1; }
  li { display: grid; grid-template-columns: 1.6rem 1fr; gap: 0.5rem; align-items: baseline; }
  .num { font-style: italic; font-weight: 700; color: var(--accent); font-feature-settings: 'tnum'; font-size: 0.85rem; }
  .title { font-style: italic; font-size: 0.92rem; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .rule { position: absolute; left: 0.8rem; right: 0.8rem; bottom: 0; height: 1px; background: var(--line); }
</style>
