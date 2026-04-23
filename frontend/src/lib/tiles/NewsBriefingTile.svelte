<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Item {
    id: string;
    source: string;
    headline: string;
    when: string;
  }

  interface NewsProps {
    sources?: string[];
    count?: number;
    demo?: Item[];
  }

  interface Props {
    id: string;
    props?: NewsProps;
  }

  let { id, props = {} }: Props = $props();
  const count = $derived(Math.min(Math.max(props.count ?? 5, 1), 12));
  const items: Item[] = $derived(
    props.demo ?? [
      { id: '1', source: 'HN', headline: 'New Celeron board benchmarks', when: '14m' },
      { id: '2', source: 'BBC', headline: 'Market mood: cautiously up', when: '38m' },
      { id: '3', source: 'NYT', headline: 'Transit strike averted', when: '1h' },
      { id: '4', source: 'The Verge', headline: 'Display panel shortage eases', when: '3h' },
      { id: '5', source: 'Ars', headline: 'Kernel 6.13 scheduler fixes', when: '5h' }
    ]
  );
</script>

<BaseTile {id} type="news_briefing" label="News Briefing">
  <div class="nb" data-testid="news">
    <h4 class="mono">Briefing</h4>
    <ul>
      {#each items.slice(0, count) as it (it.id)}
        <li>
          <span class="src mono">{it.source}</span>
          <span class="hl">{it.headline}</span>
          <span class="when mono">{it.when}</span>
        </li>
      {/each}
    </ul>
  </div>
</BaseTile>

<style>
  .nb {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    height: 100%;
  }
  h4 {
    color: var(--dim);
    font-size: 0.75rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  li {
    display: grid;
    grid-template-columns: 56px 1fr 32px;
    gap: 8px;
    align-items: baseline;
    font-size: 0.95rem;
    padding: 3px 0;
    border-bottom: 1px solid var(--line);
  }
  .src {
    color: var(--accent-2);
    font-size: 0.75rem;
    text-transform: uppercase;
  }
  .hl {
    color: var(--fg);
  }
  .when {
    color: var(--dim);
    font-size: 0.8rem;
    text-align: right;
  }
</style>
