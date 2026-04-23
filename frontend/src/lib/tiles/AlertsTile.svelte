<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Alert {
    id: string;
    severity: 'info' | 'warn' | 'critical';
    title: string;
    when: string;
    source?: string;
  }

  interface AlertProps {
    severity_min?: 'info' | 'warn' | 'critical';
    demo?: Alert[];
  }

  interface Props {
    id: string;
    props?: AlertProps;
  }

  let { id, props = {} }: Props = $props();

  const rank = { info: 0, warn: 1, critical: 2 } as const;
  const min = $derived(props.severity_min ?? 'info');
  const alerts: Alert[] = $derived(
    (
      props.demo ?? [
        { id: '1', severity: 'critical', title: 'Backup failed', when: '3m', source: 'restic' },
        { id: '2', severity: 'warn', title: 'Disk > 85% on plex', when: '22m', source: 'host' },
        { id: '3', severity: 'warn', title: 'Frigate latency 240ms', when: '1h', source: 'nvr' },
        { id: '4', severity: 'info', title: 'Nightly index rebuilt', when: '6h', source: 'immich' }
      ]
    ).filter((a) => rank[a.severity] >= rank[min])
  );
</script>

<BaseTile {id} type="alerts" label="Alerts">
  <div class="al" data-testid="alerts">
    <h4 class="mono">Alerts {alerts.length ? `· ${alerts.length}` : ''}</h4>
    {#if alerts.length === 0}
      <div class="none mono">all clear</div>
    {:else}
      <ul>
        {#each alerts as a (a.id)}
          <li class="sev-{a.severity}">
            <span class="sev mono">{a.severity}</span>
            <span class="t">{a.title}</span>
            {#if a.source}<span class="src mono">{a.source}</span>{/if}
            <span class="when mono">{a.when}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</BaseTile>

<style>
  .al {
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
  .none {
    color: var(--ok);
    font-size: 12px;
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
    grid-template-columns: 64px 1fr auto 32px;
    gap: 8px;
    align-items: baseline;
    padding: 4px 6px;
    border-radius: var(--radius-sm);
    border-left: 3px solid var(--line);
    font-size: 12px;
  }
  li.sev-critical {
    border-left-color: var(--bad);
  }
  li.sev-warn {
    border-left-color: var(--warn);
  }
  li.sev-info {
    border-left-color: var(--accent);
  }
  .sev {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--dim);
  }
  .sev-critical .sev {
    color: var(--bad);
  }
  .sev-warn .sev {
    color: var(--warn);
  }
  .t {
    color: var(--fg);
  }
  .src {
    color: var(--dim);
    font-size: 10px;
  }
  .when {
    color: var(--dim);
    font-size: 11px;
    text-align: right;
  }
</style>
