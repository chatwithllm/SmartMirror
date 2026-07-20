import type { PoolClient } from "pg";
import { PG_NOTIFY_CHANNEL } from "@hermes/shared";
import { authorize } from "../../../lib/auth";
import { listenClient, eventById, eventsAfterSeq, type EventRow } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE live tail (DESIGN §6, RULE 8). Emits one `data:` event per timeline row
 * with `id:<seq>`. On reconnect the browser sends `Last-Event-ID`; we replay
 * every event after that cursor, then go live — no gap. Overlap is harmless: the
 * client dedupes on seq. Heartbeat every 15s; the DB LISTEN is released and the
 * client returned to the pool on disconnect.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // EventSource cannot set request headers, so the device token may arrive as a
  // `?token=` query param. Normalise it into an Authorization header for auth.
  const headers = new Headers(req.headers);
  const queryToken = url.searchParams.get("token");
  if (queryToken && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${queryToken}`);
  }

  const auth = await authorize(headers, "read");
  if (!auth.ok) return new Response(auth.reason, { status: auth.status });

  const lastEventId =
    req.headers.get("last-event-id") ?? url.searchParams.get("lastEventId") ?? null;
  const cursor = lastEventId != null && lastEventId !== "" ? Number(lastEventId) : null;

  const encoder = new TextEncoder();
  let client: PoolClient | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let cleaned = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const frame = (row: EventRow): void => {
        controller.enqueue(encoder.encode(`id: ${row.seq}\n`));
        controller.enqueue(encoder.encode(`event: event\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(row)}\n\n`));
      };

      client = await listenClient();

      client.on("notification", (msg) => {
        if (msg.channel !== PG_NOTIFY_CHANNEL || !msg.payload) return;
        void eventById(msg.payload.trim())
          .then((row) => {
            if (row) frame(row);
          })
          .catch((err) => console.error("[sse] lookup failed:", err));
      });

      await client.query(`LISTEN ${PG_NOTIFY_CHANNEL}`);

      // Replay everything the client missed while offline (no gap).
      if (cursor != null && Number.isFinite(cursor)) {
        const missed = await eventsAfterSeq(cursor);
        for (const row of missed) frame(row);
      }

      controller.enqueue(encoder.encode(`: connected\n\n`));
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* stream closed */
        }
      }, 15_000);
    },
    async cancel() {
      await cleanup();
    },
  });

  const cleanup = async (): Promise<void> => {
    if (cleaned) return; // abort + cancel can both fire — tear down once (RULE 8)
    cleaned = true;
    if (heartbeat) clearInterval(heartbeat);
    if (client) {
      try {
        client.removeAllListeners("notification");
        await client.query(`UNLISTEN ${PG_NOTIFY_CHANNEL}`);
      } catch {
        /* ignore */
      } finally {
        client.release();
        client = null;
      }
    }
  };

  // Abort (tab closed / navigation) also tears down the listener.
  req.signal.addEventListener("abort", () => void cleanup());

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
