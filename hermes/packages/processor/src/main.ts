import { loadConfig } from "./config";
import { Db } from "./db";
import { ProcessorBus } from "./bus";
import { Pipeline } from "./pipeline";
import { startHealthServer } from "./health";

/**
 * Processor entrypoint — the only DB writer. Consumes the ingest bus, runs the
 * enrichment/correlation pipeline, persists to Postgres, and routes escalations
 * and command replies back out.
 */
async function main(): Promise<void> {
  const cfg = loadConfig();
  console.log("[processor] starting");

  const db = new Db(cfg.databaseUrl);
  const bus = new ProcessorBus({
    url: cfg.mqttUrl,
    username: cfg.mqttUsername,
    password: cfg.mqttPassword,
  });
  const pipeline = new Pipeline(db, bus, {
    windowSec: cfg.correlationWindowSec,
    routeThreshold: cfg.routeThreshold,
    ha: cfg.ha,
  });

  bus.onEnvelope((e) => pipeline.handle(e));

  let dbOk = await db.ping();
  const dbPing = setInterval(() => void db.ping().then((ok) => (dbOk = ok)), 10_000);

  startHealthServer(cfg.healthPort, () => ({ bus: bus.isConnected(), db: dbOk }));

  bus.connect();
  console.log("[processor] up");

  const shutdown = async (): Promise<void> => {
    console.log("[processor] shutting down");
    clearInterval(dbPing);
    await bus.close();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error("[processor] fatal:", err);
  process.exit(1);
});
