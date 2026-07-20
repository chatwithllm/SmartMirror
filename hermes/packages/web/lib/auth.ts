import { createHash } from "node:crypto";
import { getPool } from "./db";

/**
 * App-level auth (DESIGN §6). The PWA sits behind an authenticating reverse
 * proxy that sets a trusted identity header; the app additionally gates every
 * `/api/*` call with a per-device non-admin token, hash-checked against the
 * `devices` table. The browser never holds an admin token (RULE 10).
 *
 * (Auth.js v5 is the intended session layer at the proxy boundary; the binding
 * requirement — a hashed per-device token gating the API — is implemented here.)
 */

export type Scope = "read" | "write";

export interface Device {
  id: string;
  label: string;
  scopes: Scope[];
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The proxy-trusted identity, if the configured header is present. */
export function proxyIdentity(headers: Headers): string | null {
  const name = process.env.PROXY_IDENTITY_HEADER ?? "x-hermes-user";
  return headers.get(name);
}

function extractToken(headers: Headers): string | null {
  const auth = headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const direct = headers.get("x-hermes-device-token");
  return direct?.trim() ?? null;
}

export interface AuthResult {
  ok: boolean;
  status: number;
  device?: Device;
  identity?: string | null;
  reason?: string;
}

/**
 * Validate a request against the device-token model. Returns an AuthResult the
 * route handler turns into a 401/403 or proceeds. Never throws on a bad token.
 */
export async function authorize(headers: Headers, need: Scope = "read"): Promise<AuthResult> {
  const token = extractToken(headers);
  if (!token) return { ok: false, status: 401, reason: "missing device token" };

  const { rows } = await getPool().query<{
    id: string;
    label: string;
    scopes: Scope[];
  }>(
    `SELECT id, label, scopes FROM devices
      WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row) return { ok: false, status: 401, reason: "unknown or revoked token" };

  const scopes = row.scopes ?? [];
  if (!scopes.includes(need)) {
    return { ok: false, status: 403, reason: `token lacks "${need}" scope` };
  }
  return {
    ok: true,
    status: 200,
    device: { id: row.id, label: row.label, scopes },
    identity: proxyIdentity(headers),
  };
}
