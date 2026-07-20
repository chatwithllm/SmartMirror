import { SEVERITY, type Severity } from "@hermes/shared";

/** Processor configuration, read from env only (RULE 10). */
export interface ProcessorConfig {
  databaseUrl: string;
  mqttUrl: string;
  mqttUsername?: string;
  mqttPassword?: string;
  correlationWindowSec: number;
  routeThreshold: Severity;
  healthPort: number;
  ha: { url?: string; token?: string };
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function severity(name: string, fallback: Severity): Severity {
  const v = process.env[name];
  return (SEVERITY as readonly string[]).includes(v ?? "") ? (v as Severity) : fallback;
}

export function loadConfig(): ProcessorConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[processor] DATABASE_URL not set");
    process.exit(1);
  }
  return {
    databaseUrl,
    mqttUrl: process.env.MQTT_URL ?? "mqtt://localhost:1883",
    mqttUsername: process.env.MQTT_USERNAME || undefined,
    mqttPassword: process.env.MQTT_PASSWORD || undefined,
    correlationWindowSec: num("CORRELATION_WINDOW", 300),
    routeThreshold: severity("ROUTE_THRESHOLD", "warn"),
    healthPort: num("PROCESSOR_HEALTH_PORT", 8082),
    ha: { url: process.env.HA_URL || undefined, token: process.env.HA_TOKEN || undefined },
  };
}
