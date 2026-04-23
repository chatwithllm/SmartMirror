<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import BaseTile from './BaseTile.svelte';

  interface ClockProps {
    format?: '24h' | '12h';
    showSeconds?: boolean;
    showDate?: boolean;
    locale?: string;
  }

  interface Props {
    id: string;
    props?: ClockProps;
  }

  let { id, props = {} }: Props = $props();

  const format = $derived(props.format ?? '24h');
  const showSeconds = $derived(props.showSeconds ?? true);
  const showDate = $derived(props.showDate ?? true);
  const locale = $derived(props.locale ?? 'en-GB');

  let now = $state(new Date());
  let timer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    timer = setInterval(() => {
      now = new Date();
    }, 1000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  const timeText = $derived(
    now.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: showSeconds ? '2-digit' : undefined,
      hour12: format === '12h'
    })
  );

  const dateText = $derived(
    now.toLocaleDateString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    })
  );
</script>

<BaseTile {id} type="clock" label="Clock">
  <div class="clock">
    <time class="time" datetime={now.toISOString()} data-testid="clock-time"
      >{timeText}</time
    >
    {#if showDate}
      <div class="date" data-testid="clock-date">{dateText}</div>
    {/if}
  </div>
</BaseTile>

<style>
  .clock {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    gap: var(--gap-sm);
  }

  .time {
    font-size: clamp(48px, 12vw, 180px);
    font-weight: 300;
    letter-spacing: -0.02em;
    line-height: 1;
    color: var(--fg);
    font-variant-numeric: tabular-nums;
  }

  .date {
    font-size: clamp(14px, 1.6vw, 22px);
    color: var(--dim);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
</style>
