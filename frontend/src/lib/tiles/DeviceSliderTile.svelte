<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Device {
    id: string;
    name: string;
    value: number; // 0..100
    unit?: string;
  }

  interface Props {
    id: string;
    props?: { devices?: string[]; demo?: Device[] };
  }

  let { id, props = {} }: Props = $props();

  let devices = $state<Device[]>(
    props.demo ?? [
      { id: 'l1', name: 'Living lamp', value: 68, unit: '%' },
      { id: 'l2', name: 'Kitchen', value: 40, unit: '%' },
      { id: 'hv', name: 'Thermostat', value: 68, unit: '°F' },
      { id: 'fn', name: 'Fan', value: 30, unit: '%' }
    ]
  );

  function setValue(iid: string, v: number) {
    devices = devices.map((d) => (d.id === iid ? { ...d, value: v } : d));
    try {
      window.dispatchEvent(
        new CustomEvent('mirror:device_slider', { detail: { id: iid, value: v } })
      );
    } catch {
      /* ignore */
    }
  }
</script>

<BaseTile {id} type="device_slider" label="Devices">
  <div class="ds" data-testid="device-sliders">
    <h4 class="mono">Devices</h4>
    <ul>
      {#each devices as d (d.id)}
        <li>
          <span class="n">{d.name}</span>
          <input
            type="range"
            min="0"
            max="100"
            value={d.value}
            oninput={(e) => setValue(d.id, Number((e.target as HTMLInputElement).value))}
            data-testid={`slider-${d.id}`}
          />
          <span class="v mono">{d.value}{d.unit ?? ''}</span>
        </li>
      {/each}
    </ul>
  </div>
</BaseTile>

<style>
  .ds {
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
    gap: 6px;
  }
  li {
    display: grid;
    grid-template-columns: 96px 1fr 48px;
    gap: 8px;
    align-items: center;
    font-size: 12px;
  }
  .n {
    color: var(--fg);
  }
  .v {
    color: var(--dim);
    text-align: right;
    font-size: 11px;
  }
  input[type='range'] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 3px;
    background: var(--panel-2);
    border-radius: 2px;
    outline: none;
  }
  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--bg);
    cursor: pointer;
  }
</style>
