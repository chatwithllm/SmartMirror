import { authorize } from "../../../lib/auth";
import { recentEvents, eventsAfterSeq } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read the timeline. `?after=<seq>` returns events strictly after that cursor in
 * ascending order (client hydrate / IndexedDB backfill); otherwise the latest N
 * newest-first. Device-token gated (read scope).
 */
export async function GET(req: Request): Promise<Response> {
  const auth = await authorize(req.headers, "read");
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status });

  const url = new URL(req.url);
  const after = url.searchParams.get("after");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 1000);

  const events = after != null ? await eventsAfterSeq(Number(after), limit) : await recentEvents(limit);
  return Response.json({ events });
}
