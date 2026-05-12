<script lang="ts">
  /**
   * Kanban board mirror — 4-column layout matching the SmartKanban
   * web app (Backlog / Today / In Progress / Done). Each column shows
   * just card titles (no descriptions) so the whole board fits in
   * section-2's height. Editorial typography: italic Fraunces + gold
   * accent on column headers.
   */
  import { getContext, onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { isStale } from '$lib/cards/stale.js';
  import { SECTION_EMPTY_CTX } from '$lib/sections/empty.js';
  import EditorialTicker from '$lib/EditorialTicker.svelte';

  interface Props {
    id: string;
    isActive: boolean;
    props?: { pollMs?: number; projects?: string[] };
  }
  let { isActive, props = {} }: Props = $props();

  const pollMs = $derived(Math.max(props.pollMs ?? 30_000, 10_000));
  const projects = $derived(props.projects);

  type Status = 'backlog' | 'today' | 'in_progress' | 'done';
  interface KanbanCard {
    id: string;
    title: string;
    status: Status | string;
    tags: string[];
    project: string | null;
    updated_at: string;
  }

  let allCards = $state<KanbanCard[]>([]);
  let configured = $state(false);
  let failed = $state(false);
  let lastSuccessTs = $state(0);
  let timer: ReturnType<typeof setInterval> | null = null;

  // Fixed column order — matches the kanban app left-to-right.
  const COLUMNS: { key: Status; label: string }[] = [
    { key: 'backlog', label: 'Backlog' },
    { key: 'today', label: 'Today' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'done', label: 'Done' }
  ];

  async function load() {
    try {
      const r = await fetch('/api/kanban/cards', { cache: 'no-store' });
      if (!r.ok) {
        failed = true;
        return;
      }
      const j = (await r.json()) as { configured?: boolean; cards?: KanbanCard[] };
      configured = Boolean(j.configured);
      const all = j.cards ?? [];
      allCards =
        projects && projects.length > 0
          ? all.filter((c) => c.project !== null && projects.includes(c.project))
          : all;
      failed = false;
      lastSuccessTs = Date.now();
    } catch {
      failed = true;
    }
  }

  onMount(() => {
    if (!browser || !isActive) return;
    void load();
    timer = setInterval(load, pollMs);
  });
  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  const stale = $derived(isStale(lastSuccessTs, pollMs));

  const byColumn = $derived.by(() => {
    const out: Record<Status, KanbanCard[]> = {
      backlog: [],
      today: [],
      in_progress: [],
      done: []
    };
    for (const c of allCards) {
      const s = c.status as Status;
      if (s in out) out[s].push(c);
    }
    // Sort each column by updated_at desc.
    for (const k of Object.keys(out) as Status[]) {
      out[k].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    }
    return out;
  });

  const grandTotal = $derived(allCards.length);

  // Tell the host section we're empty so it can collapse to MIN.
  // Gated on lastSuccessTs so first-mount skeletons don't trigger
  // a collapse before any data arrives.
  const markEmpty = getContext<(v: boolean) => void>(SECTION_EMPTY_CTX);
  $effect(() => {
    if (!markEmpty) return;
    markEmpty(configured && lastSuccessTs > 0 && grandTotal === 0);
  });

  // Fit-count per column. After paint we measure ul.clientHeight and
  // one rendered card's offsetHeight, then render only the items that
  // fully fit. Remainder collapses to "+N more". ResizeObserver
  // re-measures on any board layout change.
  let boardEl: HTMLDivElement | null = $state(null);
  let fitCount = $state<Record<string, number>>({});

  function measureFit() {
    if (!boardEl) return;
    const next: Record<string, number> = {};
    for (const col of boardEl.querySelectorAll<HTMLElement>('.col')) {
      const key = col.dataset.col;
      if (!key) continue;
      const ul = col.querySelector<HTMLUListElement>('ul');
      if (!ul) continue;
      const trueTotal = byColumn[key as Status]?.length ?? 0;
      if (trueTotal === 0) { next[key] = 0; continue; }
      const ulH = ul.clientHeight;
      const firstItem = ul.querySelector<HTMLElement>('li.card');
      if (!firstItem) { next[key] = 0; continue; }
      const itemH = firstItem.offsetHeight;
      const cs = getComputedStyle(ul);
      const gap =
        parseFloat(cs.rowGap || '0') ||
        parseFloat(cs.gap || '0') || 0;
      const slot = itemH + gap;
      const fitNoFooter = Math.max(1, Math.floor((ulH + gap) / slot));
      // Compare against full data (trueTotal), not the currently-
      // rendered DOM count — otherwise the fit count can never grow
      // back when the column gets taller via drag-resize.
      if (fitNoFooter >= trueTotal) {
        next[key] = trueTotal;
      } else {
        next[key] = Math.max(1, fitNoFooter - 1);
      }
    }
    fitCount = next;
  }

  $effect(() => {
    void byColumn;
    if (!browser || !boardEl) return;
    requestAnimationFrame(measureFit);
  });

  $effect(() => {
    if (!browser || !boardEl) return;
    const ro = new ResizeObserver(() => requestAnimationFrame(measureFit));
    ro.observe(boardEl);
    return () => ro.disconnect();
  });

  // Marquee items: counts summary + today + in-progress titles. Done
  // skipped (not actionable). Backlog skipped (too noisy).
  const tickerItems = $derived.by(() => {
    if (lastSuccessTs === 0 || !configured || grandTotal === 0) return [];
    const out: string[] = [];
    const today = byColumn.today;
    const wip = byColumn.in_progress;
    const counts = `${grandTotal} cards · ${today.length} today · ${wip.length} in progress`;
    out.push(counts);
    for (const c of today) out.push(`Today · ${c.title}`);
    for (const c of wip) out.push(`Doing · ${c.title}`);
    return out;
  });
</script>

<section class="kb" data-stale={stale ? 'true' : undefined}>
  <EditorialTicker tag="Kanban" items={tickerItems} durationSec={80} />

  {#if failed}
    <p class="fail">— card unavailable —</p>
  {:else if lastSuccessTs === 0}
    <div class="skel">
      {#each COLUMNS as col (col.key)}
        <div class="skel-col">
          <span class="skel-bar w70"></span>
          <span class="skel-bar w90"></span>
          <span class="skel-bar w60"></span>
        </div>
      {/each}
    </div>
  {:else if !configured}
    <p class="empty">Kanban not configured</p>
  {:else}
    <div class="board" bind:this={boardEl}>
      {#each COLUMNS as col (col.key)}
        {@const items = byColumn[col.key]}
        {@const fit = fitCount[col.key] ?? items.length}
        {@const hidden = Math.max(0, items.length - fit)}
        <div class="col" data-col={col.key}>
          <div class="col-h">
            <span class="col-title">{col.label}</span>
            <span class="col-count">{items.length}</span>
          </div>
          {#if items.length === 0}
            <div class="col-empty">—</div>
          {:else}
            <ul>
              {#each items.slice(0, fit) as c (c.id)}
                <li class="card">{c.title}</li>
              {/each}
              {#if hidden > 0}
                <li class="more">+{hidden} more</li>
              {/if}
            </ul>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
  <div class="rule" aria-hidden="true"></div>
</section>

<style>
  .kb {
    height: 100%;
    padding: 0.6rem 0.8rem 0.7rem;
    display: flex;
    flex-direction: column;
    color: var(--fg);
    font-family: 'Fraunces', Georgia, serif;
    position: relative;
    min-height: 0;
  }
  .empty,
  .fail {
    font-style: italic;
    color: var(--dim);
    font-size: 1.05rem;
    margin: auto 0;
    text-align: center;
  }
  .fail { color: var(--dimmer); }

  /* 2×2 board. DOM order is [backlog, today, in_progress, done];
   * grid-auto-flow: column packs them down the left column first,
   * then the right — yielding:
   *   ┌─────────────┬──────────────┐
   *   │  BACKLOG    │  IN PROGRESS │
   *   ├─────────────┼──────────────┤
   *   │  TODAY      │  DONE        │
   *   └─────────────┴──────────────┘
   * minmax(0, …) on both axes keeps text-overflow: ellipsis honest. */
  .board {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    grid-auto-flow: column;
    gap: 0.5rem 0.7rem;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
    min-height: 0;
    /* Subtle column background tint per status — barely-there hue
     * change so columns read as separate without breaking editorial. */
    padding: 0.35rem 0.4rem 0.45rem;
    border-radius: 2px;
    border-top: 2px solid var(--col-rule, var(--line));
    background: var(--col-bg, transparent);
  }
  .col[data-col='backlog']     { --col-rule: var(--dim);     --col-bg: rgba(110, 100,  88, 0.06); }
  .col[data-col='today']       { --col-rule: #c95a4a;        --col-bg: rgba(201,  90,  74, 0.08); }
  .col[data-col='in_progress'] { --col-rule: var(--accent);  --col-bg: rgba(216, 179, 107, 0.10); }
  .col[data-col='done']        { --col-rule: #87a876;        --col-bg: rgba(135, 168, 118, 0.08); }

  .col-h {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 1px solid var(--line);
    padding-bottom: 0.25rem;
    margin-bottom: 0.15rem;
  }
  .col-title {
    font-style: italic;
    font-weight: 700;
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--col-rule);
  }
  .col-count {
    font-style: italic;
    font-size: 0.7rem;
    color: var(--dim);
    font-feature-settings: 'tnum';
  }
  .col-empty {
    font-style: italic;
    color: var(--dimmer);
    font-size: 0.75rem;
    text-align: center;
    padding: 0.4rem 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    overflow: hidden;
    flex: 1;
    min-height: 0;
  }
  li.more {
    flex: 0 0 auto;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 0.7rem;
    color: var(--dim);
    padding: 0.18rem 0 0;
    margin-top: 0.1rem;
    text-align: right;
    letter-spacing: 0.04em;
  }
  li.card {
    /* flex-shrink: 0 is critical — without it, flex column items
     * squash to fit when ul has constrained height, which made every
     * backlog item render as a 1-line-tall ghost regardless of
     * font-size. With shrink off, each item keeps its natural height
     * and overflow:hidden on ul cuts the ones that don't fit. */
    flex: 0 0 auto;
    font-family: 'Fraunces', Georgia, serif;
    font-style: normal;
    font-weight: 500;
    font-size: 0.82rem;
    line-height: 1.3;
    letter-spacing: 0;
    color: var(--fg);
    padding: 0.22rem 0;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .col[data-col='done'] li.card {
    color: var(--dim);
    text-decoration: line-through;
    text-decoration-color: var(--dimmer);
  }
  .col[data-col='in_progress'] li.card {
    color: var(--accent);
  }

  .rule {
    position: absolute;
    left: 0.8rem;
    right: 0.8rem;
    bottom: 0;
    height: 1px;
    background: var(--line);
  }
  .kb[data-stale='true'] {
    opacity: 0.6;
    transition: opacity 400ms ease;
  }

  /* Skeleton (first-load) */
  .skel {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 0.7rem;
  }
  .skel-col {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding-top: 0.5rem;
  }
  .skel-bar {
    display: block;
    height: 0.7rem;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--line) 0%, var(--line-strong) 50%, var(--line) 100%);
    background-size: 200% 100%;
    animation: skel-shimmer 1.6s ease-in-out infinite;
  }
  .skel-bar.w70 { width: 70%; }
  .skel-bar.w90 { width: 90%; }
  .skel-bar.w60 { width: 60%; }
  @keyframes skel-shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
