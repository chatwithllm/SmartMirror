import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import {
  type TelemetrySource,
  type AdapterHealth,
  type PublishFn,
  makeEnvelope,
} from "@hermes/shared";

interface HaState {
  entity_id?: string;
  state?: string;
  last_changed?: string;
  attributes?: Record<string, unknown>;
}
interface HaEvent {
  type: string;
  event?: { data?: { entity_id?: string; new_state?: HaState | null; old_state?: HaState | null } };
}

/**
 * Home Assistant WebSocket TelemetrySource (machine, inbound-only).
 * Subscribes to `state_changed` and emits one `status` envelope per change with
 * `actor:system`. Severity is left at info; the Processor classifies. The
 * entity id rides in `raw` so the Processor's extractor picks it up.
 */
export class HaSource implements TelemetrySource {
  readonly name = "ha";
  private ws: WebSocket | null = null;
  private status: AdapterHealth["status"] = "down";
  private detail = "not started";
  private lastActivity: string | undefined;
  private msgId = 1;
  private publish: PublishFn = () => {};
  private stopped = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opts: { url?: string; token?: string }) {}

  async start(publish: PublishFn): Promise<void> {
    this.publish = publish;
    if (!this.opts.url || !this.opts.token) {
      this.status = "down";
      this.detail = "HA_URL / HA_TOKEN not set";
      console.warn("[ha] not configured — source idle");
      return;
    }
    this.connect();
  }

  private wsUrl(): string {
    return this.opts.url!.replace(/^http/, "ws").replace(/\/$/, "") + "/api/websocket";
  }

  private connect(): void {
    if (this.stopped) return;
    const ws = new WebSocket(this.wsUrl());
    this.ws = ws;

    ws.on("message", (data) => {
      let msg: HaEvent;
      try {
        msg = JSON.parse(data.toString()) as HaEvent;
      } catch {
        return;
      }
      if (msg.type === "auth_required") {
        ws.send(JSON.stringify({ type: "auth", access_token: this.opts.token }));
      } else if (msg.type === "auth_ok") {
        this.status = "ok";
        this.detail = "subscribed";
        ws.send(JSON.stringify({ id: this.msgId++, type: "subscribe_events", event_type: "state_changed" }));
        console.log("[ha] authenticated, subscribed to state_changed");
      } else if (msg.type === "auth_invalid") {
        this.status = "down";
        this.detail = "auth_invalid";
        console.error("[ha] auth invalid — check HA_TOKEN");
      } else if (msg.type === "event") {
        this.onStateChanged(msg);
      }
    });

    ws.on("close", () => {
      if (this.status === "ok") this.status = "down";
      this.detail = "disconnected";
      this.scheduleReconnect();
    });
    ws.on("error", (err) => {
      this.detail = `ws error: ${err.message}`;
      console.error("[ha] ws error:", err.message);
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  private onStateChanged(msg: HaEvent): void {
    const data = msg.event?.data;
    const entityId = data?.entity_id;
    const newState = data?.new_state;
    if (!entityId || !newState) return;
    const stateValue = newState.state ?? "unknown";
    const envelope = makeEnvelope({
      id: randomUUID(),
      ts: newState.last_changed ?? new Date().toISOString(),
      source: "ha",
      kind: "status",
      actor: "system",
      channel: "-",
      severity: "info",
      body: `${entityId} → ${stateValue}`,
      tags: [`entity:${entityId}`],
      raw: {
        entity_id: entityId,
        state: stateValue,
        old_state: data?.old_state?.state,
        attributes: newState.attributes ?? {},
      },
    });
    this.lastActivity = envelope.ts;
    this.publish(envelope);
  }

  health(): AdapterHealth {
    return { name: this.name, status: this.status, detail: this.detail, lastActivity: this.lastActivity };
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
