import { loadConfig } from "./config";
import { CollectorBus } from "./bus";
import { AdapterRegistry } from "./registry";
import { startHealthServer } from "./health";
import { TelegramAdapter } from "./adapters/telegram";
import { HaSource } from "./sources/ha";
import { registerStubs } from "./adapters/stubs";

/**
 * Collector entrypoint. Wires the bus, the adapter registry, and the health
 * server. Adapters publish inbound envelopes to the bus; the bus routes egress
 * envelopes back to the matching channel adapter. The Collector touches neither
 * Postgres nor the Processor (RULE 5).
 */
async function main(): Promise<void> {
  const cfg = loadConfig();
  console.log("[collector] starting");

  const bus = new CollectorBus({
    url: cfg.mqttUrl,
    username: cfg.mqttUsername,
    password: cfg.mqttPassword,
    bufferDir: cfg.bufferDir,
  });

  const registry = new AdapterRegistry();
  registry.register(new TelegramAdapter(cfg.telegram));
  registry.register(new HaSource(cfg.ha));
  registerStubs(registry);

  bus.onEgressMessage((channel, e) => void registry.deliver(channel, e));

  startHealthServer(cfg.healthPort, () => ({
    role: "collector",
    bus: bus.isConnected(),
    adapters: registry.health(),
  }));

  bus.connect();
  await registry.startAll((e) => bus.publish(e));

  console.log("[collector] up");

  const shutdown = async (): Promise<void> => {
    console.log("[collector] shutting down");
    await registry.stopAll();
    await bus.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error("[collector] fatal:", err);
  process.exit(1);
});
