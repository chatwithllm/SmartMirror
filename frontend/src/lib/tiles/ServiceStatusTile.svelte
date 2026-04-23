<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Svc {
    name: string;
    state: 'up' | 'down' | 'degraded';
    latencyMs?: number;
  }

  interface StatusProps {
    services?: string[];
    demo?: Svc[];
  }

  interface Props {
    id: string;
    props?: StatusProps;
  }

  let { id, props = {} }: Props = $props();

  const services: Svc[] = $derived(
    props.demo ?? [
      { name: 'home_assistant', state: 'up', latencyMs: 12 },
      { name: 'plex', state: 'up', latencyMs: 38 },
      { name: 'immich', state: 'up', latencyMs: 22 },
      { name: 'frigate', state: 'degraded', latencyMs: 240 },
      { name: 'grocy', state: 'up', latencyMs: 18 },
      { name: 'backup', state: 'down' }
    ]
  );
</script>

<BaseTile {id} type="service_status" label="Service Status">
  <div class="svc" data-testid="svc-status">
    <h4 class="mono">Services</h4>
    <ul>
      {#each services as s (s.name)}
        <li class="row">
          <span class="dot state-{s.state}" aria-label={s.state}></span>
          <span class="name mono">{s.name}</span>
          <span class="latency mono">
            {#if s.latencyMs !== undefined}{s.latencyMs}ms{:else}—{/if}
          </span>
        </li>
      {/each}
    </ul>
  </div>
</BaseTile>

<style>
  .svc {
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
    gap: 3px;
  }
  .row {
    display: grid;
    grid-template-columns: 0.77rem 1fr auto;
    gap: 8px;
    align-items: center;
    padding: 3px 0;
    font-size: 0.85rem;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }
  .state-up {
    background: var(--ok);
  }
  .state-degraded {
    background: var(--warn);
  }
  .state-down {
    background: var(--bad);
    box-shadow: 0 0 8px var(--bad);
  }
  .name {
    color: var(--fg);
    font-size: 0.85rem;
  }
  .latency {
    color: var(--dim);
    font-size: 0.8rem;
    text-align: right;
  }
</style>
