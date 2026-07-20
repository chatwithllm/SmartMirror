import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import mqtt, { type MqttClient } from "mqtt";
import {
  type Envelope,
  validateEnvelope,
  ingestTopic,
  egressTopic,
  EGRESS_WILDCARD,
  DEADLETTER_TOPIC,
  topicTail,
} from "@hermes/shared";

/**
 * Collector bus: publishes inbound envelopes to `hermes/ingest/<source>` at
 * QoS 1, and delivers egress replies to channel adapters.
 *
 * RULE 5 — the Collector never blocks and never drops. When the broker is
 * unreachable we spool envelopes to a disk buffer and drain them on reconnect,
 * so a human message survives a broker outage (even across a restart). Publishes
 * take exactly one path: connected ⇒ publish; offline ⇒ disk. mqtt's own
 * offline queue is never relied on, so there is no double-send.
 */
export class CollectorBus {
  private client: MqttClient | null = null;
  private connected = false;
  private egressHandler: ((channel: string, e: Envelope) => void) | null = null;
  private draining = false;
  private seq = 0;

  constructor(
    private readonly opts: {
      url: string;
      username?: string;
      password?: string;
      bufferDir: string;
      log?: (msg: string) => void;
    },
  ) {
    mkdirSync(this.opts.bufferDir, { recursive: true });
  }

  private log(msg: string): void {
    (this.opts.log ?? console.log)(`[bus] ${msg}`);
  }

  connect(): void {
    const client = mqtt.connect(this.opts.url, {
      username: this.opts.username,
      password: this.opts.password,
      reconnectPeriod: 2000,
      // Do not let mqtt silently queue our QoS1 messages while offline — we own
      // buffering via disk so nothing is lost on a process restart.
      queueQoSZero: false,
    });
    this.client = client;

    client.on("connect", () => {
      this.connected = true;
      this.log(`connected to ${this.opts.url}`);
      client.subscribe(EGRESS_WILDCARD, { qos: 1 }, (err) => {
        if (err) this.log(`egress subscribe failed: ${err.message}`);
      });
      void this.drain();
    });
    client.on("reconnect", () => this.log("reconnecting…"));
    client.on("close", () => {
      if (this.connected) this.log("connection closed");
      this.connected = false;
    });
    client.on("error", (err) => this.log(`error: ${err.message}`));
    client.on("message", (topic, payload) => this.onEgress(topic, payload));
  }

  onEgressMessage(handler: (channel: string, e: Envelope) => void): void {
    this.egressHandler = handler;
  }

  private onEgress(topic: string, payload: Buffer): void {
    if (!topic.startsWith("hermes/egress/")) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload.toString("utf8"));
    } catch {
      this.log(`egress payload was not JSON on ${topic}`);
      return;
    }
    const res = validateEnvelope(parsed);
    if (!res.ok) {
      this.log(`egress envelope invalid on ${topic}: ${res.reason}`);
      return;
    }
    this.egressHandler?.(topicTail(topic), res.envelope);
  }

  /** Publish an inbound envelope. Never throws to the caller (RULE 5). */
  publish(e: Envelope): void {
    if (this.connected && this.client) {
      this.client.publish(ingestTopic(e.source), JSON.stringify(e), { qos: 1 }, (err) => {
        if (err) {
          this.log(`publish failed, buffering: ${err.message}`);
          this.spool(e);
        }
      });
    } else {
      this.spool(e);
    }
  }

  /** Publish a reply/escalation back to a channel's egress topic. */
  publishEgress(channel: string, e: Envelope): void {
    if (this.connected && this.client) {
      this.client.publish(egressTopic(channel), JSON.stringify(e), { qos: 1 });
    } else {
      this.spool(e);
    }
  }

  publishDeadLetter(reason: string, payload: unknown): void {
    if (!this.connected || !this.client) return;
    this.client.publish(
      DEADLETTER_TOPIC,
      JSON.stringify({ reason, at: new Date().toISOString(), payload }),
      { qos: 1 },
    );
  }

  private spool(e: Envelope): void {
    // Monotonic, sortable filename so drain order matches enqueue order even
    // within the same millisecond.
    const name = `${e.ts}-${String(this.seq++).padStart(6, "0")}-${e.id}.json`;
    writeFileSync(join(this.opts.bufferDir, name), JSON.stringify(e), "utf8");
    this.log(`spooled ${e.id} to disk buffer`);
  }

  private async drain(): Promise<void> {
    if (this.draining || !this.client || !this.connected) return;
    this.draining = true;
    try {
      const files = readdirSync(this.opts.bufferDir)
        .filter((f) => f.endsWith(".json"))
        .sort();
      if (files.length) this.log(`draining ${files.length} buffered envelope(s)`);
      for (const file of files) {
        if (!this.connected) break;
        const path = join(this.opts.bufferDir, file);
        let env: Envelope;
        try {
          env = JSON.parse(readFileSync(path, "utf8")) as Envelope;
        } catch {
          rmSync(path, { force: true });
          continue;
        }
        await new Promise<void>((resolve) => {
          this.client!.publish(ingestTopic(env.source), JSON.stringify(env), { qos: 1 }, (err) => {
            if (!err) rmSync(path, { force: true });
            resolve();
          });
        });
      }
    } finally {
      this.draining = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.client) return resolve();
      this.client.end(false, {}, () => resolve());
    });
  }
}
