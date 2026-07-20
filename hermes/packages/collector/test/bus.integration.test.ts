import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server as NetServer } from "node:net";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import Aedes from "aedes";
import mqtt, { type MqttClient } from "mqtt";
import { makeEnvelope } from "@hermes/shared";
import { CollectorBus } from "../src/bus";

/**
 * Proves RULE 5 / PLAN P1.1: the Collector never drops a message. A publish
 * issued while the bus is not connected spools to the disk buffer, and on
 * (re)connect the buffer drains to the broker in order — nothing is lost.
 */
describe("CollectorBus disk buffer + drain", () => {
  let broker: Aedes;
  let net: NetServer;
  let url: string;
  let bufferDir: string;
  let control: MqttClient;

  const waitFor = async (fn: () => boolean, ms = 6000): Promise<void> => {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("waitFor timed out");
  };

  beforeAll(async () => {
    broker = new Aedes();
    net = createServer(broker.handle);
    await new Promise<void>((res) => net.listen(0, "127.0.0.1", res));
    const port = (net.address() as { port: number }).port;
    url = `mqtt://127.0.0.1:${port}`;
    bufferDir = mkdtempSync(join(tmpdir(), "hermes-buf-"));
    control = mqtt.connect(url);
    await new Promise<void>((res) => control.on("connect", () => res()));
  }, 20000);

  afterAll(async () => {
    control?.end(true);
    await new Promise<void>((res) => broker.close(() => res()));
    await new Promise<void>((res) => net.close(() => res()));
    rmSync(bufferDir, { recursive: true, force: true });
  });

  it("spools while disconnected, then drains on connect", async () => {
    const received: string[] = [];
    await new Promise<void>((res) =>
      control.subscribe("hermes/ingest/telegram", { qos: 1 }, () => res()),
    );
    control.on("message", (_t, payload) => received.push(payload.toString()));

    const bus = new CollectorBus({ url, bufferDir });

    // Publish BEFORE connect → the bus is not connected → spool to disk.
    const id = randomUUID();
    bus.publish(
      makeEnvelope({
        id,
        ts: new Date().toISOString(),
        source: "telegram",
        kind: "message",
        actor: "nik",
        channel: "telegram",
        body: "buffered while offline",
      }),
    );
    // The envelope is on disk, not yet delivered.
    expect(readdirSync(bufferDir).filter((f) => f.endsWith(".json")).length).toBe(1);
    expect(received.length).toBe(0);

    // Now connect → drain.
    bus.connect();
    await waitFor(() => received.length === 1);
    expect(received[0]).toContain(id);

    // Buffer emptied after successful drain.
    await waitFor(() => readdirSync(bufferDir).filter((f) => f.endsWith(".json")).length === 0);

    await bus.close();
  });
});
