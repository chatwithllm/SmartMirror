<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Host {
    name: string;
    cpu: number; // 0..100
    ramPct: number;
    diskPct: number;
    uptimeH: number;
  }

  interface HostProps {
    hosts?: string[];
    demo?: Host[];
  }

  interface Props {
    id: string;
    props?: HostProps;
  }

  let { id, props = {} }: Props = $props();

  const hosts: Host[] = $derived(
    props.demo ?? [
      { name: 'ha', cpu: 18, ramPct: 42, diskPct: 61, uptimeH: 812 },
      { name: 'plex', cpu: 54, ramPct: 73, diskPct: 88, uptimeH: 220 },
      { name: 'mirror', cpu: 21, ramPct: 55, diskPct: 14, uptimeH: 6 }
    ]
  );

  function barColor(pct: number) {
    if (pct >= 85) return 'var(--bad)';
    if (pct >= 65) return 'var(--warn)';
    return 'var(--ok)';
  }
</script>

<BaseTile {id} type="host_health" label="Host Health">
  <div class="hh" data-testid="host-health">
    <h4 class="mono">Hosts</h4>
    <div class="grid">
      {#each hosts as h (h.name)}
        <section class="host">
          <header>
            <span class="mono name">{h.name}</span>
            <span class="mono up">{h.uptimeH}h</span>
          </header>
          <div class="metric">
            <span class="label mono">CPU</span>
            <div class="bar">
              <div class="fill" style:width="{h.cpu}%" style:background={barColor(h.cpu)}></div>
            </div>
            <span class="mono val">{h.cpu}%</span>
          </div>
          <div class="metric">
            <span class="label mono">RAM</span>
            <div class="bar">
              <div class="fill" style:width="{h.ramPct}%" style:background={barColor(h.ramPct)}></div>
            </div>
            <span class="mono val">{h.ramPct}%</span>
          </div>
          <div class="metric">
            <span class="label mono">DSK</span>
            <div class="bar">
              <div class="fill" style:width="{h.diskPct}%" style:background={barColor(h.diskPct)}></div>
            </div>
            <span class="mono val">{h.diskPct}%</span>
          </div>
        </section>
      {/each}
    </div>
  </div>
</BaseTile>

<style>
  .hh {
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
  .grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: hidden;
  }
  .host {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--line);
  }
  header {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
  }
  .name {
    color: var(--fg);
  }
  .up {
    color: var(--dim);
  }
  .metric {
    display: grid;
    grid-template-columns: 32px 1fr 34px;
    gap: 6px;
    align-items: center;
    font-size: 10px;
  }
  .label {
    color: var(--dim);
  }
  .bar {
    height: 4px;
    background: var(--panel-2);
    border-radius: 2px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    transition: width var(--motion-med) ease;
  }
  .val {
    color: var(--fg);
    text-align: right;
  }
</style>
