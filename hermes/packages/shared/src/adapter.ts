import type { Envelope } from "./envelope";

/**
 * Adapter contracts (DESIGN.md §8). Channel adapters are human + bidirectional;
 * telemetry sources are machine + inbound-only. A stub implements the interface,
 * publishes nothing, and reports `status: 'stub'`.
 */

export type AdapterStatus = "ok" | "degraded" | "down" | "stub";

export interface AdapterHealth {
  name: string;
  status: AdapterStatus;
  detail?: string;
  /** ISO-8601 UTC of the last inbound/outbound activity, if any. */
  lastActivity?: string;
}

/** A function an adapter calls to push an inbound envelope onto the bus. */
export type PublishFn = (e: Envelope) => void;

export interface ChannelAdapter {
  readonly name: string;
  /** Wire up inbound → bus. Must not throw on transient channel errors. */
  start(publish: PublishFn): Promise<void>;
  /** Deliver an egress envelope back out to the channel. */
  deliver(e: Envelope): Promise<void>;
  health(): AdapterHealth;
  /** Optional graceful shutdown (RULE 8 — every subscribe cleans up). */
  stop?(): Promise<void>;
}

export interface TelemetrySource {
  readonly name: string;
  start(publish: PublishFn): Promise<void>;
  health(): AdapterHealth;
  stop?(): Promise<void>;
}

export type Adapter = ChannelAdapter | TelemetrySource;

export function isChannelAdapter(a: Adapter): a is ChannelAdapter {
  return typeof (a as ChannelAdapter).deliver === "function";
}
