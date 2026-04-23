import type { RequestHandler } from './$types';
import { spawn } from 'node:child_process';

type Action = 'reload_browser' | 'restart_frontend' | 'reboot';
const ALLOWED: readonly Action[] = ['reload_browser', 'restart_frontend', 'reboot'] as const;

function runLogged(cmd: string, args: string[]): void {
  console.log(`[admin] exec: ${cmd} ${args.join(' ')}`);
  const child = spawn(cmd, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout?.on('data', (d) => process.stdout.write(`[admin:${cmd}] ${d}`));
  child.stderr?.on('data', (d) => process.stderr.write(`[admin:${cmd}] ${d}`));
  child.on('exit', (code, sig) => {
    console.log(`[admin] ${cmd} exited code=${code} sig=${sig ?? 'null'}`);
  });
  child.on('error', (err) => {
    console.error(`[admin] ${cmd} spawn failed:`, err);
  });
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
  console.log(`[admin] action=${action} host=${request.headers.get('host')}`);

  switch (action) {
    case 'reload_browser':
      // mirror user can kill its own chrome; mirror-kiosk systemd user
      // service has Restart=always so it respawns within ~5s.
      runLogged('/usr/bin/pkill', ['-9', '-f', 'chrome']);
      break;
    case 'restart_frontend':
      // Respond first, then exit. systemd restarts mirror-frontend.
      setTimeout(() => process.exit(0), 200);
      break;
    case 'reboot':
      // Needs sudoers NOPASSWD (installer drops /etc/sudoers.d/mirror-reboot).
      // /sbin/reboot is a symlink to /bin/systemctl on Ubuntu 24.04; the
      // canonical, unambiguous command is `systemctl reboot`.
      runLogged('/usr/bin/sudo', ['-n', '/usr/bin/systemctl', 'reboot']);
      break;
  }

  return new Response(JSON.stringify({ ok: true, action }), {
    headers: { 'content-type': 'application/json' },
  });
};
