// Server-side client for the household "LocalOCR Extended" grocery
// app. Auth preference order:
//
//   1. GROCERY_KEY env var (stored in /etc/mirror/config.env)
//   2. /opt/mirror/data/grocery.key on disk (owned by mirror user,
//      editable without sudo via the /settings/grocery page)
//   3. GROCERY_EMAIL + GROCERY_PASSWORD session-cookie fallback
//
// Anything missing → client disabled. Proxies return { configured:
// false } and tiles fall back to demo data.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const BASE = (process.env.GROCERY_URL ?? '').replace(/\/$/, '');
const ENV_KEY = process.env.GROCERY_KEY ?? '';
const EMAIL = process.env.GROCERY_EMAIL ?? '';
const PASSWORD = process.env.GROCERY_PASSWORD ?? '';

// Default path lives under mirror's home so the systemd service (User=mirror)
// can write it without sudo. Override with GROCERY_KEY_FILE if you want
// something else (e.g. systemd StateDirectory at /var/lib/mirror).
export const KEY_FILE =
  process.env.GROCERY_KEY_FILE ?? '/home/mirror/.config/mirror/grocery.key';

// Runtime state.
let fileKey: string | null = null;
let fileKeyLoaded = false;
let cookie: string | null = null;
let loginInFlight: Promise<boolean> | null = null;

async function loadFileKey(): Promise<void> {
  if (fileKeyLoaded) return;
  try {
    const raw = await readFile(KEY_FILE, 'utf8');
    const trimmed = raw.trim();
    fileKey = trimmed || null;
  } catch {
    fileKey = null;
  } finally {
    fileKeyLoaded = true;
  }
}

export async function setApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  fileKey = trimmed || null;
  fileKeyLoaded = true;
  cookie = null; // invalidate session cache — key wins
  if (!trimmed) {
    // Store an empty file so reads are deterministic (not an error).
    await mkdir(dirname(KEY_FILE), { recursive: true });
    await writeFile(KEY_FILE, '', { mode: 0o600 });
    return;
  }
  await mkdir(dirname(KEY_FILE), { recursive: true });
  await writeFile(KEY_FILE, trimmed + '\n', { mode: 0o600 });
}

async function resolveKey(): Promise<string | null> {
  if (ENV_KEY) return ENV_KEY;
  await loadFileKey();
  return fileKey;
}

export async function isGroceryConfigured(): Promise<boolean> {
  if (!BASE) return false;
  if (await resolveKey()) return true;
  return Boolean(EMAIL && PASSWORD);
}

export async function groceryAuthMode(): Promise<'key' | 'session' | 'none'> {
  if (!BASE) return 'none';
  if (await resolveKey()) return 'key';
  if (EMAIL && PASSWORD) return 'session';
  return 'none';
}

async function login(): Promise<boolean> {
  if (!BASE || !EMAIL || !PASSWORD) return false;
  if (loginInFlight) return loginInFlight;
  loginInFlight = (async () => {
    try {
      const r = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
      });
      if (!r.ok) {
        console.warn(`[grocery] login failed HTTP ${r.status}`);
        cookie = null;
        return false;
      }
      const setCookie = r.headers.get('set-cookie') ?? '';
      const m = setCookie.match(/session=[^;]+/);
      cookie = m ? m[0] : null;
      if (!cookie) console.warn('[grocery] login OK but no session cookie');
      return Boolean(cookie);
    } catch (e) {
      console.warn('[grocery] login error', e);
      cookie = null;
      return false;
    } finally {
      loginInFlight = null;
    }
  })();
  return loginInFlight;
}

async function authedFetch(path: string): Promise<Response | null> {
  if (!BASE) return null;
  const key = await resolveKey();

  // Key path — stateless.
  if (key) {
    const url = `${BASE}${path}`;
    const r = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${key}`,
        'X-API-Key': key, // send both; app accepts whichever
      },
    });
    if (!r.ok) {
      console.warn(`[grocery] (key) ${path} HTTP ${r.status}`);
      return null;
    }
    return r;
  }

  // Session fallback.
  if (!EMAIL || !PASSWORD) return null;
  if (!cookie) {
    const ok = await login();
    if (!ok) return null;
  }
  const url = `${BASE}${path}`;
  const send = () =>
    fetch(url, { headers: { Accept: 'application/json', Cookie: cookie ?? '' } });
  let r = await send();
  if (r.status === 401) {
    const ok = await login();
    if (!ok) return null;
    r = await send();
  }
  if (!r.ok) {
    console.warn(`[grocery] (session) ${path} HTTP ${r.status}`);
    return null;
  }
  return r;
}

export async function fetchGroceryJson<T = unknown>(path: string): Promise<T | null> {
  const r = await authedFetch(path);
  if (!r) return null;
  try {
    return (await r.json()) as T;
  } catch {
    return null;
  }
}
