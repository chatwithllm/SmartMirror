<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Props {
    id: string;
    props?: {
      monthlyBudget?: number;
      spent?: number;
      currency?: string;
      label?: string;
    };
  }

  let { id, props = {} }: Props = $props();

  const currency = $derived(props.currency ?? '$');
  const monthly = $derived(props.monthlyBudget ?? 500);
  const spent = $derived(props.spent ?? 312);
  const pct = $derived(Math.min(100, Math.round((spent / monthly) * 100)));

  // Paceline: spent should track (day_of_month / days_in_month).
  const now = new Date();
  const daysIn = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const paceDay = now.getDate();
  const expectedPct = Math.round((paceDay / daysIn) * 100);
  const overpace = $derived(pct - expectedPct);
</script>

<BaseTile {id} type="budget" label={props.label ?? 'Budget'}>
  <div class="bg" data-testid="budget">
    <h4 class="mono">{props.label ?? 'Grocery budget'}</h4>
    <div class="row">
      <div class="spent mono">{currency}{spent}</div>
      <div class="of mono">/ {currency}{monthly}</div>
      <div class="pct mono" class:over={overpace > 10} class:under={overpace < -10}>
        {pct}%
      </div>
    </div>
    <div class="bar">
      <div class="fill" style:width="{pct}%"></div>
      <div class="pace" style:left="{expectedPct}%" title={`pace: ${expectedPct}%`}></div>
    </div>
    <div class="note mono">
      day {paceDay}/{daysIn} ·
      {overpace > 10 ? 'over pace' : overpace < -10 ? 'under pace' : 'on pace'}
    </div>
  </div>
</BaseTile>

<style>
  .bg {
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
  .row {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .spent {
    color: var(--fg);
    font-size: 2.2rem;
    font-weight: 300;
  }
  .of {
    color: var(--dim);
    font-size: 0.85rem;
  }
  .pct {
    margin-left: auto;
    color: var(--fg);
    font-size: 0.85rem;
  }
  .pct.over {
    color: var(--bad);
  }
  .pct.under {
    color: var(--ok);
  }
  .bar {
    position: relative;
    height: 6px;
    background: var(--panel-2);
    border-radius: 3px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--accent);
  }
  .pace {
    position: absolute;
    top: -2px;
    width: 2px;
    height: 10px;
    background: var(--fg);
  }
  .note {
    color: var(--dim);
    font-size: 0.75rem;
  }
</style>
