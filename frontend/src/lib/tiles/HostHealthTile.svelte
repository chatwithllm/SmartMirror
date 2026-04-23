<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import BaseTile from './BaseTile.svelte';
  import { getEntity } from '$lib/ha/entity.js';

  interface Host {
    name: string;
    cpu: number;
    ramPct: number;
    diskPct: number;
    uptimeH: number;
  }

  interface HostCfg {
    name: string;
    cpu?: string;       // entity_id
    ram?: string;       // entity_id
    disk?: string;      // entity_id
    uptime?: string;    // entity_id
  }

  interface HostProps {
    // New: list of HA-sensor-backed hosts
    hosts?: HostCfg[];
    demo?: Host[];
  }

  interface Props {
    id: string;
    props?: HostProps;
  }

  let { id, props = {} }: Props = $props();

  let liveHosts = $state<Host[] | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function pullAll() {
    if (!props.hosts?.length) return;
    const resolved: Host[] = [];
    for (const h of props.hosts) {
      const [cpu, ram, disk, uptime] = await Promise.all([
        h.cpu ? getEntity(h.cpu) : Promise.resolve(null),
        h.ram ? getEntity(h.ram) : Promise.resolve(null),
        h.disk ? getEntity(h.disk) : Promise.resolve(null),
        h.uptime ? getEntity(h.uptime) : Promise.resolve(null)
      ]);
      const toN = (s?: string | null) => (s == null ? 0 : Number(s) || 0);
      resolved.push({
        name: h.name,
        cpu: Math.round(toN(cpu?.state)),
        ramPct: Math.round(toN(ram?.state)),
        diskPct: Math.round(toN(disk?.state)),
        uptimeH: Math.round(toN(uptime?.state))
      });
    }
    liveHosts = resolved;
  }

  onMount(() => {
    if (!props.hosts?.length) return;
    void pullAll();
    timer = setInterval(() => void pullAll(), 15_000);
  });
  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  const hosts: Host[] = $derived(
    liveHosts ??
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
    font-size: 0.75rem;
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
    font-size: 0.8rem;
  }
  .name {
    color: var(--fg);
  }
  .up {
    color: var(--dim);
  }
  .metric {
    display: grid;
    grid-template-columns: 2.46rem 1fr 2.62rem;
    gap: 6px;
    align-items: center;
    font-size: 0.75rem;
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
