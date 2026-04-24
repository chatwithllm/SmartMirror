// Server-side client for the household "LocalOCR Extended" / Grocery
// Manager Flask app running on the LAN. Session-cookie auth: login
// once via /auth/login, keep the cookie in memory, retry on 401.
//
// Configured via env (read once at module load):
//   GROCERY_URL       e.g. http://192.168.50.13:8090
//   GROCERY_EMAIL
//   GROCERY_PASSWORD
//
// Anything missing → client is disabled; callers get null and can
// fall back to demo data.

const BASE = (process.env.GROCERY_URL ?? '').replace(/\/$/, '');
const EMAIL = process.env.GROCERY_EMAIL ?? '';
const PASSWORD = process.env.GROCERY_PASSWORD ?? '';

let cookie: string | null = null;
let loginInFlight: Promise<boolean> | null = null;

export function isGroceryConfigured(): boolean {
  return Boolean(BASE && EMAIL && PASSWORD);
}

async function login(): Promise<boolean> {
  if (!isGroceryConfigured()) return false;
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
      // Werkzeug/Flask sets `session=...` via Set-Cookie. Capture it.
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
  if (!isGroceryConfigured()) return null;
  if (!cookie) {
    const ok = await login();
    if (!ok) return null;
  }
  const url = `${BASE}${path}`;
  const send = () =>
    fetch(url, {
      headers: {
        Accept: 'application/json',
        Cookie: cookie ?? '',
      },
    });
  let r = await send();
  if (r.status === 401) {
    // Cookie expired — one retry after fresh login.
    const ok = await login();
    if (!ok) return null;
    r = await send();
  }
  if (!r.ok) {
    console.warn(`[grocery] ${path} HTTP ${r.status}`);
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
