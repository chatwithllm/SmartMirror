<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Step {
    id: string;
    name: string;
    state: 'pending' | 'running' | 'ok' | 'fail';
  }

  interface Props {
    id: string;
    props?: { pipeline?: string; demo?: Step[] };
  }

  let { id, props = {} }: Props = $props();

  const steps: Step[] = $derived(
    props.demo ?? [
      { id: '1', name: 'checkout', state: 'ok' },
      { id: '2', name: 'install', state: 'ok' },
      { id: '3', name: 'lint', state: 'ok' },
      { id: '4', name: 'test', state: 'running' },
      { id: '5', name: 'build', state: 'pending' },
      { id: '6', name: 'deploy', state: 'pending' }
    ]
  );
</script>

<BaseTile {id} type="deploy_pipeline" label="Pipeline">
  <div class="dp" data-testid="deploy">
    <h4 class="mono">Pipeline</h4>
    <ol>
      {#each steps as s, i (s.id)}
        <li class="s-{s.state}">
          <span class="n mono">{String(i + 1).padStart(2, '0')}</span>
          <span class="name">{s.name}</span>
          <span class="dot" aria-label={s.state}></span>
        </li>
      {/each}
    </ol>
  </div>
</BaseTile>

<style>
  .dp {
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
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  li {
    display: grid;
    grid-template-columns: 1.85rem 1fr 0.77rem;
    gap: 8px;
    align-items: center;
    font-size: 0.85rem;
    padding: 3px 0;
    border-bottom: 1px solid var(--line);
  }
  .n {
    color: var(--dim);
  }
  .name {
    color: var(--fg);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--dim);
  }
  .s-ok .dot {
    background: var(--ok);
  }
  .s-running .dot {
    background: var(--warn);
    animation: pulse 1s infinite alternate;
  }
  .s-fail .dot {
    background: var(--bad);
  }
  @keyframes pulse {
    from {
      opacity: 1;
    }
    to {
      opacity: 0.4;
    }
  }
</style>
