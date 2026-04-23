<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import BaseTile from './BaseTile.svelte';

  interface Meeting {
    title: string;
    start: string; // ISO
    joinUrl?: string;
  }

  interface Props {
    id: string;
    props?: { meeting?: Meeting; demo?: Meeting };
  }

  let { id, props = {} }: Props = $props();

  const meeting: Meeting = $derived(
    props.meeting ??
      props.demo ?? {
        title: 'Next meeting',
        start: new Date(Date.now() + 12 * 60 * 1000).toISOString(),
        joinUrl: 'https://meet.google.com/xxx'
      }
  );

  let tick = $state(Date.now());
  let timer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    timer = setInterval(() => (tick = Date.now()), 1000);
  });
  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  const remaining = $derived.by(() => {
    void tick;
    return new Date(meeting.start).getTime() - Date.now();
  });

  function mmss(ms: number) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = (total % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
</script>

<BaseTile {id} type="meeting_countdown" label="Next Meeting">
  <div class="mc" data-testid="meeting">
    <h4 class="mono">Next meeting</h4>
    <div class="title">{meeting.title}</div>
    <div class="count mono" class:imminent={remaining < 2 * 60 * 1000}>
      {remaining <= 0 ? 'now' : `in ${mmss(remaining)}`}
    </div>
    {#if meeting.joinUrl}
      <a class="join mono" href={meeting.joinUrl} target="_blank" rel="noopener">Join →</a>
    {/if}
  </div>
</BaseTile>

<style>
  .mc {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    height: 100%;
    justify-content: center;
  }
  h4 {
    color: var(--dim);
    font-size: 0.75rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  .title {
    color: var(--fg);
    font-size: 1.05rem;
  }
  .count {
    font-size: 2.2rem;
    color: var(--fg);
    font-variant-numeric: tabular-nums;
  }
  .count.imminent {
    color: var(--bad);
    animation: pulse 1s infinite alternate;
  }
  @keyframes pulse {
    from {
      opacity: 1;
    }
    to {
      opacity: 0.6;
    }
  }
  .join {
    color: var(--accent);
    font-size: 0.85rem;
    text-decoration: none;
  }
</style>
