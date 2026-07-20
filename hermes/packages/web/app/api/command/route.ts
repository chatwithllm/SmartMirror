import { randomUUID } from "node:crypto";
import { makeEnvelope } from "@hermes/shared";
import { authorize } from "../../../lib/auth";
import { publishCommand } from "../../../lib/bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Issue a command (DESIGN §6). Publishes a `command` envelope to the bus; the
 * Processor executes it and writes the command + response events, which surface
 * back through the SSE stream. Requires a device token with `write` scope.
 *
 * Body: { body: string, channel?: string }. The reply routes to the PWA via the
 * event stream; `channel` defaults to `web`.
 */
export async function POST(req: Request): Promise<Response> {
  const auth = await authorize(req.headers, "write");
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status });

  let payload: { body?: unknown; channel?: unknown };
  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400 });
  }
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!body) return Response.json({ error: "body is required" }, { status: 400 });
  const channel = typeof payload.channel === "string" && payload.channel ? payload.channel : "web";

  const envelope = makeEnvelope({
    id: randomUUID(),
    ts: new Date().toISOString(),
    source: channel,
    kind: "command",
    actor: "nik",
    channel,
    body,
    tags: [`device:${auth.device!.id}`],
    raw: { issued_by: auth.identity ?? auth.device!.label, device_id: auth.device!.id },
  });

  try {
    await publishCommand(envelope);
  } catch (err) {
    return Response.json({ error: `bus publish failed: ${(err as Error).message}` }, { status: 502 });
  }
  return Response.json({ ok: true, id: envelope.id });
}
