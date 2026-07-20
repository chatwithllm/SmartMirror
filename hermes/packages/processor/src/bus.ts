import mqtt, { type MqttClient } from "mqtt";
import {
  type Envelope,
  validateEnvelope,
  egressTopic,
  statusTopic,
  INGEST_WILDCARD,
  DEADLETTER_TOPIC,
} from "@hermes/shared";

/**
 * Processor bus: consumes `hermes/ingest/+` at QoS 1, validates every message
 * against the envelope schema (RULE 2 — malformed ⇒ dead-letter, never a silent
 * drop), and hands valid envelopes to the pipeline. Publishes egress replies and
 * retained status tiles.
 */
export class ProcessorBus {
  private client: MqttClient | null = null;
  private connected = false;
  private handler: ((e: Envelope) => Promise<void>) | null = null;

  constructor(
    private readonly opts: { url: string; username?: string; password?: string },
  ) {}

  onEnvelope(handler: (e: Envelope) => Promise<void>): void {
    this.handler = handler;
  }

  connect(): void {
    const client = mqtt.connect(this.opts.url, {
      username: this.opts.username,
      password: this.opts.password,
      reconnectPeriod: 2000,
    });
    this.client = client;

    client.on("connect", () => {
      this.connected = true;
      console.log(`[bus] connected to ${this.opts.url}`);
      client.subscribe(INGEST_WILDCARD, { qos: 1 }, (err) => {
        if (err) console.error(`[bus] ingest subscribe failed: ${err.message}`);
        else console.log(`[bus] subscribed ${INGEST_WILDCARD}`);
      });
    });
    client.on("close", () => {
      this.connected = false;
    });
    client.on("error", (err) => console.error(`[bus] error: ${err.message}`));
    client.on("message", (topic, payload) => void this.onMessage(topic, payload));
  }

  private async onMessage(topic: string, payload: Buffer): Promise<void> {
    if (!topic.startsWith("hermes/ingest/")) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload.toString("utf8"));
    } catch {
      this.publishDeadLetter("payload is not valid JSON", topic, payload.toString("utf8"));
      return;
    }
    const res = validateEnvelope(parsed);
    if (!res.ok) {
      this.publishDeadLetter(res.reason, topic, parsed);
      return;
    }
    try {
      await this.handler?.(res.envelope);
    } catch (err) {
      console.error(`[bus] pipeline error for ${res.envelope.id}:`, err);
      this.publishDeadLetter(
        `pipeline error: ${(err as Error).message}`,
        topic,
        res.envelope,
      );
    }
  }

  publishEgress(channel: string, e: Envelope): void {
    this.client?.publish(egressTopic(channel), JSON.stringify(e), { qos: 1 });
  }

  publishStatus(source: string, e: Envelope): void {
    // Retained so a fresh subscriber gets current state instantly (DESIGN §3).
    this.client?.publish(statusTopic(source), JSON.stringify(e), { qos: 1, retain: true });
  }

  publishDeadLetter(reason: string, topic: string, payload: unknown): void {
    console.warn(`[deadletter] ${reason}`);
    this.client?.publish(
      DEADLETTER_TOPIC,
      JSON.stringify({ reason, at: new Date().toISOString(), topic, payload }),
      { qos: 1 },
    );
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
