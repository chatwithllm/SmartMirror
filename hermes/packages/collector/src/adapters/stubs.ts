import {
  type ChannelAdapter,
  type TelemetrySource,
  type AdapterHealth,
  type Envelope,
  type PublishFn,
} from "@hermes/shared";
import type { AdapterRegistry } from "../registry";

/**
 * Stub adapters (DESIGN.md §8 / PLAN P4.1). A stub implements the interface,
 * publishes nothing, delivers nothing, and reports `status: 'stub'`. It is a
 * placeholder, NOT a half-implementation — the shape is proven, the wiring is
 * a TODO.
 */

class StubChannel implements ChannelAdapter {
  constructor(readonly name: string) {}
  // TODO: implement inbound polling/webhook → envelope → publish.
  async start(_publish: PublishFn): Promise<void> {}
  // TODO: implement egress delivery back to the channel.
  async deliver(_e: Envelope): Promise<void> {}
  health(): AdapterHealth {
    return { name: this.name, status: "stub", detail: "not implemented (v1 stub)" };
  }
}

class StubSource implements TelemetrySource {
  constructor(readonly name: string) {}
  // TODO: implement telemetry poll/subscribe → envelope → publish.
  async start(_publish: PublishFn): Promise<void> {}
  health(): AdapterHealth {
    return { name: this.name, status: "stub", detail: "not implemented (v1 stub)" };
  }
}

/** Human channels stubbed for v1. */
export const STUB_CHANNELS = ["signal", "discord", "imap", "meshtastic"] as const;
/** Machine sources stubbed for v1. */
export const STUB_SOURCES = ["proxmox", "unifi", "frigate"] as const;

export function registerStubs(registry: AdapterRegistry): void {
  for (const name of STUB_CHANNELS) registry.register(new StubChannel(name));
  for (const name of STUB_SOURCES) registry.register(new StubSource(name));
}
