<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import BaseTile from './BaseTile.svelte';

  interface Props {
    id: string;
    props?: {
      fishCount?: number;
      bubbleRate?: number;
      label?: string;
    };
  }

  let { id, props = {} }: Props = $props();

  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let width = 0;
  let height = 0;
  let raf = 0;
  let lastTs = 0;
  let bubbleAccumMs = 0;
  let running = true;

  type Fish = {
    x: number;
    y: number;
    len: number;
    color: string;
    belly: string;
    speed: number;
    dir: 1 | -1;
    targetY: number;
    wag: number;
    wagSpeed: number;
  };
  type Bubble = { x: number; y: number; r: number; drift: number; phase: number };
  type Weed = { x: number; base: number; tall: number; sway: number; hue: number };

  const FISH: Fish[] = [];
  const BUBBLES: Bubble[] = [];
  const WEEDS: Weed[] = [];

  // Warm-paper editorial palette: desaturated oceans, amber bellies.
  const FISH_COLORS: Array<[string, string]> = [
    ['#e8a15e', '#f8d3a5'],
    ['#6ec1e4', '#cfeaf5'],
    ['#f4d35e', '#fbe9a8'],
    ['#b7b5ff', '#e2e0ff'],
    ['#e4f4d8', '#fafff2'],
    ['#d45e5e', '#f2b3b3'],
    ['#8c7bff', '#d3ccff'],
    ['#f2a1c2', '#fbdeea'],
  ];

  function rand(a: number, b: number): number {
    return a + Math.random() * (b - a);
  }
  function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function spawnFish(count: number): void {
    FISH.length = 0;
    for (let i = 0; i < count; i++) {
      const len = rand(50, 120);
      const [color, belly] = pick(FISH_COLORS);
      FISH.push({
        x: rand(0, width),
        y: rand(height * 0.15, height * 0.85),
        len,
        color,
        belly,
        speed: rand(22, 55),
        dir: Math.random() < 0.5 ? -1 : 1,
        targetY: rand(height * 0.15, height * 0.85),
        wag: rand(0, Math.PI * 2),
        wagSpeed: rand(5, 8),
      });
    }
  }

  function spawnWeeds(): void {
    WEEDS.length = 0;
    const count = Math.max(6, Math.floor(width / 80));
    for (let i = 0; i < count; i++) {
      WEEDS.push({
        x: rand(0, width),
        base: height,
        tall: rand(height * 0.18, height * 0.42),
        sway: rand(0, Math.PI * 2),
        hue: rand(110, 160),
      });
    }
  }

  function spawnBubble(): void {
    BUBBLES.push({
      x: rand(0, width),
      y: height + 10,
      r: rand(3, 10),
      drift: rand(-0.3, 0.3),
      phase: rand(0, Math.PI * 2),
    });
    if (BUBBLES.length > 80) BUBBLES.shift();
  }

  function resize(): void {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx = canvas.getContext('2d');
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = props.fishCount ?? Math.round(Math.sqrt(width * height) / 40);
    spawnFish(Math.max(6, Math.min(count, 20)));
    spawnWeeds();
  }

  function drawBackground(): void {
    if (!ctx) return;
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, '#0b1e30');
    g.addColorStop(0.55, '#12425e');
    g.addColorStop(1, '#1a6670');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    // Caustic light rays from top.
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#ffffff';
    const t = performance.now() / 1800;
    for (let i = 0; i < 4; i++) {
      const cx = width * (0.2 + 0.2 * i) + Math.sin(t + i) * 30;
      ctx.beginPath();
      ctx.moveTo(cx - 6, 0);
      ctx.lineTo(cx + 6, 0);
      ctx.lineTo(cx + 80, height * 0.55);
      ctx.lineTo(cx - 80, height * 0.55);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawWeed(w: Weed, t: number): void {
    if (!ctx) return;
    const sway = Math.sin(t * 0.0012 + w.sway) * 18;
    ctx.strokeStyle = `hsl(${w.hue}, 45%, 22%)`;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(w.x, w.base);
    ctx.quadraticCurveTo(w.x + sway * 0.5, w.base - w.tall * 0.5, w.x + sway, w.base - w.tall);
    ctx.stroke();
    ctx.strokeStyle = `hsl(${w.hue}, 50%, 35%)`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawFish(f: Fish): void {
    if (!ctx) return;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(f.dir, 1);

    const body = f.len;
    const belly = body * 0.45;

    // Tail wag.
    const wag = Math.sin(f.wag) * body * 0.18;
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.moveTo(-body * 0.5, wag);
    ctx.quadraticCurveTo(-body * 0.7, wag - belly * 0.6, -body * 0.85, -belly * 0.25 + wag * 0.6);
    ctx.quadraticCurveTo(-body * 0.7, wag + belly * 0.6, -body * 0.5, wag);
    ctx.fill();

    // Body.
    ctx.beginPath();
    ctx.ellipse(0, 0, body * 0.5, belly * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Belly.
    ctx.fillStyle = f.belly;
    ctx.beginPath();
    ctx.ellipse(0, belly * 0.1, body * 0.38, belly * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    // Fin.
    ctx.fillStyle = f.color;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(-body * 0.1, 0);
    ctx.quadraticCurveTo(body * 0.1, belly * 0.6, body * 0.2, 0);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Eye.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(body * 0.32, -belly * 0.08, body * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b1e30';
    ctx.beginPath();
    ctx.arc(body * 0.34, -belly * 0.08, body * 0.025, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawBubble(b: Bubble): void {
    if (!ctx) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function step(now: number): void {
    if (!running || !ctx) return;
    const dt = Math.min(now - (lastTs || now), 80) / 1000;
    lastTs = now;

    drawBackground();

    // Seaweed.
    for (const w of WEEDS) drawWeed(w, now);

    // Fish physics.
    for (const f of FISH) {
      if (Math.abs(f.y - f.targetY) < 8) f.targetY = rand(height * 0.15, height * 0.85);
      const dy = Math.sign(f.targetY - f.y);
      f.y += dy * f.speed * 0.3 * dt;
      f.x += f.dir * f.speed * dt;
      if (f.x < -f.len) f.dir = 1;
      if (f.x > width + f.len) f.dir = -1;
      f.wag += f.wagSpeed * dt;
      drawFish(f);
    }

    // Bubbles.
    bubbleAccumMs += dt * 1000;
    const rate = props.bubbleRate ?? 220; // ms per bubble
    while (bubbleAccumMs >= rate) {
      spawnBubble();
      bubbleAccumMs -= rate;
    }
    for (let i = BUBBLES.length - 1; i >= 0; i--) {
      const b = BUBBLES[i];
      b.phase += dt * 2.4;
      b.y -= (40 + b.r * 6) * dt;
      b.x += Math.sin(b.phase) * 0.4 + b.drift;
      if (b.y < -20) BUBBLES.splice(i, 1);
      else drawBubble(b);
    }

    raf = requestAnimationFrame(step);
  }

  let ro: ResizeObserver | null = null;

  onMount(() => {
    if (!browser || !canvas) return;
    resize();
    ro = new ResizeObserver(() => resize());
    ro.observe(canvas);
    running = true;
    raf = requestAnimationFrame(step);
  });

  onDestroy(() => {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    ro?.disconnect();
  });
</script>

<BaseTile {id} type="fish_tank" label={props.label ?? 'aquarium'}>
  <canvas class="tank" bind:this={canvas} data-testid="fish-tank"></canvas>
</BaseTile>

<style>
  .tank {
    width: 100%;
    height: 100%;
    display: block;
    border-radius: calc(var(--radius-md) - 2px);
    background: #0b1e30;
  }
</style>
