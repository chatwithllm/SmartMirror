<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Line {
    id: string;
    t: string;
    lvl: 'info' | 'warn' | 'error' | 'debug';
    src: string;
    msg: string;
  }

  interface LogProps {
    source?: string;
    lines?: number;
    demo?: Line[];
  }

  interface Props {
    id: string;
    props?: LogProps;
  }

  let { id, props = {} }: Props = $props();
  const cap = $derived(Math.min(Math.max(props.lines ?? 12, 3), 40));
  const lines: Line[] = $derived(
    props.demo ?? [
      { id: 'a', t: '00:14:02', lvl: 'info', src: 'ha', msg: 'reload automation.mirror_mode_selector' },
      { id: 'b', t: '00:14:04', lvl: 'warn', src: 'frigate', msg: 'driveway latency 240ms' },
      { id: 'c', t: '00:14:07', lvl: 'error', src: 'restic', msg: 'snapshot abort: repo locked' },
      { id: 'd', t: '00:14:12', lvl: 'info', src: 'plex', msg: 'session closed token=Ax31' },
      { id: 'e', t: '00:14:16', lvl: 'debug', src: 'zigbee', msg: 'motion kitchen cleared' },
      { id: 'f', t: '00:14:18', lvl: 'info', src: 'mirror', msg: 'layout rev=1745351220 mode=work' }
    ]
  );
</script>

<BaseTile {id} type="log_tail" label="Log Tail">
  <div class="log" data-testid="log-tail">
    <h4 class="mono">Log · {props.source ?? 'all'}</h4>
    <pre class="mono">
{#each lines.slice(-cap) as l (l.id)}<span class="line lvl-{l.lvl}"><span class="t">{l.t}</span> <span class="lvl">{l.lvl.toUpperCase()}</span> <span class="src">{l.src}</span> <span class="msg">{l.msg}</span>
</span>{/each}
    </pre>
  </div>
</BaseTile>

<style>
  .log {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  h4 {
    color: var(--dim);
    font-size: 0.75rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  pre {
    margin: 0;
    padding: 0;
    font-size: 0.8rem;
    line-height: 1.5;
    overflow: hidden;
    white-space: pre;
  }
  .t {
    color: var(--dim);
  }
  .lvl {
    color: var(--dim);
    display: inline-block;
    min-width: 3.69rem;
  }
  .lvl-warn .lvl {
    color: var(--warn);
  }
  .lvl-error .lvl {
    color: var(--bad);
  }
  .lvl-debug .lvl {
    color: var(--dimmer);
  }
  .src {
    color: var(--accent);
  }
  .msg {
    color: var(--fg);
  }
</style>
