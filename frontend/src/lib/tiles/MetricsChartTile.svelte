<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Series {
    name: string;
    values: number[];
    unit?: string;
    color?: string;
  }

  interface ChartProps {
    series?: Series[];
    title?: string;
  }

  interface Props {
    id: string;
    props?: ChartProps;
  }

  let { id, props = {} }: Props = $props();

  const title = $derived(props.title ?? 'Metrics');
  const series: Series[] = $derived(
    props.series ?? [
      {
        name: 'cpu',
        unit: '%',
        color: 'var(--accent)',
        values: [18, 22, 27, 31, 22, 17, 19, 25, 34, 42, 38, 26, 22, 20]
      },
      {
        name: 'net Mbps',
        color: 'var(--accent-2)',
        values: [4, 6, 10, 8, 12, 7, 5, 14, 18, 22, 10, 6, 4, 3]
      }
    ]
  );

  function sparkPath(values: number[], width = 100, height = 24): string {
    if (values.length === 0) return '';
    const min = Math.min(...values);
    const max = Math.max(...values, min + 1);
    const step = width / Math.max(values.length - 1, 1);
    return values
      .map((v, i) => {
        const x = i * step;
        const y = height - ((v - min) / (max - min || 1)) * height;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }
</script>

<BaseTile {id} type="metrics_chart" label={title}>
  <div class="m" data-testid="metrics-chart">
    <h4 class="mono">{title}</h4>
    <div class="rows">
      {#each series as s (s.name)}
        {@const last = s.values[s.values.length - 1]}
        <div class="row">
          <span class="name mono">{s.name}</span>
          <svg viewBox="0 0 100 24" preserveAspectRatio="none">
            <path d={sparkPath(s.values)} stroke={s.color ?? 'var(--fg)'} fill="none" stroke-width="1.5" />
          </svg>
          <span class="val mono">{last}{s.unit ?? ''}</span>
        </div>
      {/each}
    </div>
  </div>
</BaseTile>

<style>
  .m {
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
  .rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row {
    display: grid;
    grid-template-columns: 72px 1fr 52px;
    gap: 8px;
    align-items: center;
    font-size: 0.8rem;
  }
  .name {
    color: var(--dim);
  }
  svg {
    width: 100%;
    height: 24px;
  }
  .val {
    color: var(--fg);
    text-align: right;
  }
</style>
