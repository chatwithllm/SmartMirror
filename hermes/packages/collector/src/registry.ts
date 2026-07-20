import {
  type Adapter,
  type ChannelAdapter,
  type Envelope,
  type PublishFn,
  isChannelAdapter,
} from "@hermes/shared";

/**
 * Adapter registry. Starts every registered adapter with the same publish fn,
 * and routes egress envelopes to the channel adapter whose `name` matches the
 * envelope's channel.
 */
export class AdapterRegistry {
  private readonly adapters: Adapter[] = [];
  private readonly channels = new Map<string, ChannelAdapter>();

  register(adapter: Adapter): this {
    this.adapters.push(adapter);
    if (isChannelAdapter(adapter)) this.channels.set(adapter.name, adapter);
    return this;
  }

  async startAll(publish: PublishFn): Promise<void> {
    await Promise.all(
      this.adapters.map(async (a) => {
        try {
          await a.start(publish);
        } catch (err) {
          console.error(`[registry] adapter ${a.name} failed to start:`, err);
        }
      }),
    );
  }

  /** Deliver an egress envelope to the adapter matching `channel`. */
  async deliver(channel: string, e: Envelope): Promise<void> {
    const adapter = this.channels.get(channel);
    if (!adapter) {
      console.warn(`[registry] no channel adapter for egress channel "${channel}"`);
      return;
    }
    try {
      await adapter.deliver(e);
    } catch (err) {
      console.error(`[registry] deliver via ${channel} failed:`, err);
    }
  }

  health() {
    return this.adapters.map((a) => a.health());
  }

  async stopAll(): Promise<void> {
    await Promise.all(this.adapters.map((a) => a.stop?.()));
  }
}
