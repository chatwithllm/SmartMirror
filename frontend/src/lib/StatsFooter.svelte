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
  .stats-footer {
    position: fixed;
    right: 10px;
    bottom: 6px;
    font-size: 0.55rem;
    letter-spacing: 0.08em;
    color: var(--dimmer);
    opacity: 0.75;
    pointer-events: none;
    z-index: 1;
    white-space: nowrap;
  }
</style>
