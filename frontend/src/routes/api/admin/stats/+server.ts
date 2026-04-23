import type { RequestHandler } from './$types';
import { readFile, statfs } from 'node:fs/promises';

// Cached /proc/stat snapshot for delta-based CPU calc.
let lastCpuSample: { idle: number; total: number; at: number } | null = null;

async function sampleCpu(): Promise<{ idle: number; total: number }> {
  const buf = await readFile('/proc/stat', 'utf-8');
  const line = buf.split('\n').find((l) => l.startsWith('cpu ')) ?? '';
  const parts = line.trim().split(/\s+/).slice(1).map(Number);
  // user nice system idle iowait irq softirq steal ...
  const idle = (parts[3] ?? 0) + (parts[4] ?? 0);
  const total = parts.reduce((a, b) => a + b, 0);
  return { idle, total };
}

async function cpuPercent(): Promise<number> {
  const now = await sampleCpu();
  if (!lastCpuSample) {
    lastCpuSample = { ...now, at: Date.now() };
    return 0;
  }
  const dIdle = now.idle - lastCpuSample.idle;
  const dTotal = now.total - lastCpuSample.total;
  lastCpuSample = { ...now, at: Date.now() };
  if (dTotal <= 0) return 0;
  return Math.max(0, Math.min(100, ((dTotal - dIdle) / dTotal) * 100));
}

async function ramPercent(): Promise<number> {
  const m = await readFile('/proc/meminfo', 'utf-8');
  const total = +(m.match(/MemTotal:\s+(\d+)/)?.[1] ?? 0);
  const avail = +(m.match(/MemAvailable:\s+(\d+)/)?.[1] ?? 0);
  if (!total) return 0;
  return Math.max(0, Math.min(100, ((total - avail) / total) * 100));
}

async function diskPercent(): Promise<number> {
  try {
    const s = await statfs('/');
    const used = s.blocks - s.bfree;
    if (!s.blocks) return 0;
    return Math.max(0, Math.min(100, (Number(used) / Number(s.blocks)) * 100));
  } catch {
    return 0;
  }
}

export const GET: RequestHandler = async () => {
  const [cpu, ram, disk] = await Promise.all([cpuPercent(), ramPercent(), diskPercent()]);
  return new Response(
    JSON.stringify({ cpu: Math.round(cpu), ram: Math.round(ram), disk: Math.round(disk) }),
    { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } },
  );
};
