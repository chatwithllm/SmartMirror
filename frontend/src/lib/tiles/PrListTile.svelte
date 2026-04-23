<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Pr {
    id: string;
    number: number;
    title: string;
    state: 'open' | 'draft' | 'merged';
    ci: 'green' | 'red' | 'running';
    author: string;
  }

  interface Props {
    id: string;
    props?: { repo?: string; demo?: Pr[] };
  }

  let { id, props = {} }: Props = $props();

  const prs: Pr[] = $derived(
    props.demo ?? [
      { id: '1', number: 142, title: 'feat: themes lazy loader', state: 'open', ci: 'green', author: 'claude' },
      { id: '2', number: 141, title: 'fix: flip seam on 4k', state: 'open', ci: 'running', author: 'claude' },
      { id: '3', number: 140, title: 'chore: pin pnpm v10', state: 'merged', ci: 'green', author: 'chatwithllm' },
      { id: '4', number: 139, title: 'test: diff swap case', state: 'draft', ci: 'red', author: 'claude' }
    ]
  );
</script>

<BaseTile {id} type="pr_list" label="PRs">
  <div class="pl" data-testid="pr-list">
    <h4 class="mono">Pull requests</h4>
    <ul>
      {#each prs as pr (pr.id)}
        <li>
          <span class="pip pip-{pr.ci}" aria-label={pr.ci}></span>
          <span class="num mono">#{pr.number}</span>
          <span class="t">{pr.title}</span>
          <span class="st mono st-{pr.state}">{pr.state}</span>
        </li>
      {/each}
    </ul>
  </div>
</BaseTile>

<style>
  .pl {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    height: 100%;
  }
  h4 {
    color: var(--dim);
    font-size: 10px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  li {
    display: grid;
    grid-template-columns: 10px 40px 1fr 56px;
    gap: 6px;
    align-items: center;
    padding: 3px 0;
    border-bottom: 1px solid var(--line);
    font-size: 12px;
  }
  .pip {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }
  .pip-green {
    background: var(--ok);
  }
  .pip-red {
    background: var(--bad);
  }
  .pip-running {
    background: var(--warn);
    animation: pulse 1s infinite alternate;
  }
  @keyframes pulse {
    from {
      opacity: 1;
    }
    to {
      opacity: 0.4;
    }
  }
  .num {
    color: var(--dim);
  }
  .t {
    color: var(--fg);
  }
  .st {
    font-size: 10px;
    text-transform: uppercase;
    text-align: right;
  }
  .st-open {
    color: var(--accent);
  }
  .st-draft {
    color: var(--dim);
  }
  .st-merged {
    color: var(--accent-2);
  }
</style>
