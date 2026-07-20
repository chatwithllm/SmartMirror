import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server as NetServer } from "node:net";
import { randomUUID } from "node:crypto";
import Aedes from "aedes";
import mqtt, { type MqttClient } from "mqtt";
import { Client as PgClient } from "pg";
import { makeEnvelope, type Envelope, ingestTopic } from "@hermes/shared";
import { Db } from "../src/db";
import { ProcessorBus } from "../src/bus";
import { Pipeline } from "../src/pipeline";

/**
 * End-to-end spine test (PLAN P1.6, P2.1–P2.3). Spins an in-process MQTT broker
 * and drives real envelopes through ProcessorBus → Pipeline → Postgres, proving:
 *  - a Telegram message AND an HA change both land in `events`
 *  - a human note + a later machine event on the same entity share a
 *    correlation_id and open one incident
 *  - QoS 1 replay of the same id is idempotent (no double row)
 *  - a `/status ha` command writes command + response and replies over egress
 *  - a malformed payload goes to the dead-letter topic, never silently dropped
 *
 * Requires a reachable Postgres (DATABASE_URL, default local dev db). If none is
 * reachable the suite is skipped with a clear message rather than failing.
 */

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://hermes:hermes@localhost:5432/hermes";

async function dbReachable(): Promise<boolean> {
  const c = new PgClient({ connectionString: DATABASE_URL });
  try {
    await c.connect();
    await c.query("SELECT 1");
    await c.end();
    return true;
  } catch {
    return false;
  }
}

const available = await dbReachable();

describe.skipIf(!available)("spine integration", () => {
  let broker: Aedes;
  let net: NetServer;
  let url: string;
  let control: MqttClient;
  let db: Db;
  let pg: PgClient;
  let bus: ProcessorBus;

  const waitFor = async (fn: () => Promise<boolean>, ms = 8000): Promise<void> => {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("waitFor timed out");
  };

  const publish = (source: string, e: Envelope): void => {
    control.publish(ingestTopic(source), JSON.stringify(e), { qos: 1 });
  };

  const countById = async (id: string): Promise<number> => {
    const { rows } = await pg.query<{ n: string }>("SELECT count(*) n FROM events WHERE id=$1", [id]);
    return Number(rows[0]!.n);
  };

  beforeAll(async () => {
    broker = new Aedes();
    net = createServer(broker.handle);
    await new Promise<void>((res) => net.listen(0, "127.0.0.1", res));
    const port = (net.address() as { port: number }).port;
    url = `mqtt://127.0.0.1:${port}`;

    pg = new PgClient({ connectionString: DATABASE_URL });
    await pg.connect();
    await pg.query("TRUNCATE events, incidents");

    db = new Db(DATABASE_URL);
    bus = new ProcessorBus({ url });
    const pipeline = new Pipeline(db, bus, {
      windowSec: 300,
      routeThreshold: "warn",
      ha: {},
    });
    bus.onEnvelope((e) => pipeline.handle(e));
    bus.connect();

    control = mqtt.connect(url);
    await new Promise<void>((res) => control.on("connect", () => res()));
    // Give the processor's ingest subscription time to attach.
    await new Promise((r) => setTimeout(r, 300));
  }, 20000);

  afterAll(async () => {
    control?.end(true);
    await bus?.close();
    await db?.close();
    await pg?.end();
    await new Promise<void>((res) => broker.close(() => res()));
    await new Promise<void>((res) => net.close(() => res()));
  });

  it("lands a Telegram message and an HA change in events", async () => {
    const tgId = randomUUID();
    const haId = randomUUID();
    publish(
      "telegram",
      makeEnvelope({
        id: tgId,
        ts: new Date().toISOString(),
        source: "telegram",
        kind: "message",
        actor: "nik",
        channel: "telegram",
        body: "morning check",
        tags: ["chat:42"],
        raw: { chat_id: 42 },
      }),
    );
    publish(
      "ha",
      makeEnvelope({
        id: haId,
        ts: new Date().toISOString(),
        source: "ha",
        kind: "status",
        actor: "system",
        body: "sensor.ess_soc → 55",
        raw: { entity_id: "sensor.ess_soc", state: "55" },
      }),
    );

    await waitFor(async () => (await countById(tgId)) === 1 && (await countById(haId)) === 1);
    const { rows } = await pg.query(
      "SELECT actor, kind, entities FROM events WHERE id=$1",
      [haId],
    );
    expect(rows[0].actor).toBe("system");
    expect(rows[0].entities).toContain("sensor.ess_soc");
  });

  it("correlates a note with a later machine event on the same entity", async () => {
    const noteId = randomUUID();
    const machineId = randomUUID();
    const t0 = new Date();
    publish(
      "telegram",
      makeEnvelope({
        id: noteId,
        ts: t0.toISOString(),
        source: "telegram",
        kind: "note",
        actor: "nik",
        channel: "telegram",
        body: "swapping the LC29H antenna on AOR-24",
      }),
    );
    await waitFor(async () => (await countById(noteId)) === 1);

    publish(
      "ha",
      makeEnvelope({
        id: machineId,
        ts: new Date(t0.getTime() + 40_000).toISOString(),
        source: "ha",
        kind: "alert",
        actor: "system",
        body: "AOR-24 rtk fix lost",
        raw: { entity_id: "AOR-24", state: "no_fix" },
      }),
    );
    await waitFor(async () => (await countById(machineId)) === 1);

    const { rows } = await pg.query<{ id: string; correlation_id: string | null }>(
      "SELECT id, correlation_id FROM events WHERE id = ANY($1)",
      [[noteId, machineId]],
    );
    const note = rows.find((r) => r.id === noteId)!;
    const machine = rows.find((r) => r.id === machineId)!;
    expect(note.correlation_id).not.toBeNull();
    expect(machine.correlation_id).toBe(note.correlation_id);

    const inc = await pg.query("SELECT id, primary_entity, status FROM incidents WHERE id=$1", [
      note.correlation_id,
    ]);
    expect(inc.rowCount).toBe(1);
    expect(inc.rows[0].primary_entity).toBe("AOR-24");
    expect(inc.rows[0].status).toBe("open");
  });

  it("is idempotent on QoS 1 replay (same id → one row)", async () => {
    const id = randomUUID();
    const e = makeEnvelope({
      id,
      ts: new Date().toISOString(),
      source: "ha",
      kind: "status",
      actor: "system",
      body: "sensor.dup → 1",
      raw: { entity_id: "sensor.dup", state: "1" },
    });
    publish("ha", e);
    publish("ha", e);
    publish("ha", e);
    await waitFor(async () => (await countById(id)) === 1);
    // Give any erroneous extra inserts a chance to appear, then re-check.
    await new Promise((r) => setTimeout(r, 400));
    expect(await countById(id)).toBe(1);
  });

  it("runs the /status ha command round-trip and replies over egress", async () => {
    const replies: string[] = [];
    await new Promise<void>((res) =>
      control.subscribe("hermes/egress/telegram", { qos: 1 }, () => res()),
    );
    control.on("message", (topic, payload) => {
      if (topic === "hermes/egress/telegram") {
        const env = JSON.parse(payload.toString()) as Envelope;
        replies.push(env.body);
      }
    });

    const cmdId = randomUUID();
    publish(
      "telegram",
      makeEnvelope({
        id: cmdId,
        ts: new Date().toISOString(),
        source: "telegram",
        kind: "command",
        actor: "nik",
        channel: "telegram",
        body: "/status ha",
        tags: ["chat:42"],
        raw: { chat_id: 42 },
      }),
    );

    await waitFor(async () => replies.length >= 1);
    expect(replies[0]).toContain("HA");

    // The exchange is logged: command event + an agent response event exist.
    await waitFor(async () => (await countById(cmdId)) === 1);
    const resp = await pg.query(
      "SELECT count(*) n FROM events WHERE actor='agent' AND raw->>'in_reply_to' = $1",
      [cmdId],
    );
    expect(Number(resp.rows[0].n)).toBe(1);
  });

  it("dead-letters a malformed payload instead of dropping it", async () => {
    const dead: string[] = [];
    await new Promise<void>((res) =>
      control.subscribe("hermes/deadletter", { qos: 1 }, () => res()),
    );
    control.on("message", (topic, payload) => {
      if (topic === "hermes/deadletter") dead.push(payload.toString());
    });

    // Invalid envelope: missing required fields.
    control.publish(ingestTopic("telegram"), JSON.stringify({ id: "not-a-uuid" }), { qos: 1 });
    await waitFor(async () => dead.length >= 1);
    expect(dead[0]).toContain("reason");
  });
});
