<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';

  let cpu = $state<number | null>(null);
  let ram = $state<number | null>(null);
  let disk = $state<number | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function tick() {
    try {
      const r = await fetch('/api/admin/stats', { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as { cpu: number; ram: number; disk: number };
      cpu = j.cpu;
      ram = j.ram;
      disk = j.disk;
    } catch {
      /* swallow — footer is best effort */
    }
  }

  onMount(() => {
    if (!browser) return;
    void tick();
    timer = setInterval(tick, 5_000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  const fmt = (v: number | null) => (v == null ? '--' : `${v}%`);
</script>

<div class="stats-footer mono" aria-hidden="true">
  CPU {fmt(cpu)} · RAM {fmt(ram)} · DISK {fmt(disk)}
</div>

<style>
  /* Absolute-positioned children of .stage sit against its padding-box
   * (i.e. the border edge), so plain `right/bottom: 12px` would ignore
   * the overscan inset. Offset by --os-right / --os-bottom (inline
   * custom properties set on .stage) to shift the footer in by the
   * same amount the rest of the UI is inset by the bezel guard. */
  .stats-footer {
    position: absolute;
    right: calc(var(--os-right, 0px) + 12px);
    bottom: calc(var(--os-bottom, 0px) + 8px);
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    color: var(--dim);
    opacity: 0.95;
    pointer-events: none;
    z-index: 2;
    white-space: nowrap;
    padding: 2px 8px;
    background: rgba(0, 0, 0, 0.35);
    border-radius: var(--radius-sm);
  }
</style>
