import { getPool } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness + DB reachability. Unauthenticated (used by the compose healthcheck). */
export async function GET(): Promise<Response> {
  let db = false;
  try {
    await getPool().query("SELECT 1");
    db = true;
  } catch {
    db = false;
  }
  return Response.json({ ok: db, role: "web", db }, { status: db ? 200 : 503 });
}
