import type { RequestHandler } from './$types';
import { spawn } from 'node:child_process';

type Action = 'reload_browser' | 'restart_frontend' | 'reboot';
const ALLOWED: readonly Action[] = ['reload_browser', 'restart_frontend', 'reboot'] as const;

function runDetached(cmd: string, args: string[]): void {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

function isLocal(req: Request): boolean {
  // The mirror's Chromium runs on the same host; we only accept admin
  // commands from localhost. X-Forwarded-For proxies are not trusted.
  const host = req.headers.get('host') ?? '';
  if (host.startsWith('127.0.0.1') || host.startsWith('localhost') || host.startsWith('[::1]')) {
    return true;
  }
  // Kiosk typically talks to http://<mirror-ip>:3000 — accept private LAN
  // but still require that the connection came from the local network.
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return false; // reverse-proxied traffic not allowed
  return true;
}

export const POST: RequestHandler = async ({ request }) => {
  if (!isLocal(request)) {
    return new Response('forbidden', { status: 403 });
  }
  let body: { action?: string } = {};
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    return new Response('bad json', { status: 400 });
  }
  const action = body.action as Action | undefined;
  if (!action || !ALLOWED.includes(action)) {
    return new Response('bad action', { status: 400 });
  }

  switch (action) {
    case 'reload_browser':
      // mirror user can kill its own chrome; mirror-kiosk systemd user
      // service has Restart=always so it respawns within ~5s.
      runDetached('/usr/bin/pkill', ['-9', '-f', 'chrome']);
      break;
    case 'restart_frontend':
      // Respond first, then exit. systemd restarts mirror-frontend.
      setTimeout(() => process.exit(0), 200);
      break;
    case 'reboot':
      // Requires sudoers NOPASSWD for /sbin/reboot (dropped by installer).
      runDetached('/usr/bin/sudo', ['-n', '/sbin/reboot']);
      break;
  }

  return new Response(JSON.stringify({ ok: true, action }), {
    headers: { 'content-type': 'application/json' },
  });
};
