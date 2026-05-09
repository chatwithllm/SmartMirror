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

async function uptimeSeconds(): Promise<number> {
  try {
    const buf = await readFile('/proc/uptime', 'utf-8');
    const first = buf.trim().split(/\s+/)[0];
    return Math.round(parseFloat(first) || 0);
  } catch {
    return 0;
  }
}

// Cached /proc/net/dev snapshot for delta-based bandwidth calc.
let lastNetSample: { rx: number; tx: number; at: number } | null = null;

async function netKbps(): Promise<{ rx: number; tx: number }> {
  try {
    const buf = await readFile('/proc/net/dev', 'utf-8');
    let totalRx = 0;
    let totalTx = 0;
    for (const line of buf.split('\n')) {
      const m = line.match(/^\s*(\w+):\s+(\d+)(?:\s+\d+){7}\s+(\d+)/);
      if (!m) continue;
      const iface = m[1];
      // Skip loopback. Anything else (eth*, wlan*, eno*, enp*, br-*, docker*) counts.
      if (iface === 'lo') continue;
      totalRx += Number(m[2]);
      totalTx += Number(m[3]);
    }
    const now = { rx: totalRx, tx: totalTx, at: Date.now() };
    if (!lastNetSample) {
      lastNetSample = now;
      return { rx: 0, tx: 0 };
    }
    const dt = (now.at - lastNetSample.at) / 1000;
    if (dt <= 0) return { rx: 0, tx: 0 };
    const rxKbps = Math.max(0, Math.round(((now.rx - lastNetSample.rx) * 8) / 1000 / dt));
    const txKbps = Math.max(0, Math.round(((now.tx - lastNetSample.tx) * 8) / 1000 / dt));
    lastNetSample = now;
    return { rx: rxKbps, tx: txKbps };
  } catch {
    return { rx: 0, tx: 0 };
  }
}

export const GET: RequestHandler = async () => {
  const [cpu, ram, disk, uptime, net] = await Promise.all([
    cpuPercent(),
    ramPercent(),
    diskPercent(),
    uptimeSeconds(),
    netKbps(),
  ]);
  return new Response(
    JSON.stringify({
      cpu: Math.round(cpu),
      ram: Math.round(ram),
      disk: Math.round(disk),
      uptime_seconds: uptime,
      net_rx_kbps: net.rx,
      net_tx_kbps: net.tx,
    }),
    { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } },
  );
};
