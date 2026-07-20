/** Collector configuration, read from env only (RULE 10 — secrets in env). */
export interface CollectorConfig {
  mqttUrl: string;
  mqttUsername?: string;
  mqttPassword?: string;
  bufferDir: string;
  healthPort: number;
  telegram: { botToken?: string; allowedChatIds: number[] };
  ha: { url?: string; token?: string };
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(): CollectorConfig {
  const allowed = (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n));

  return {
    mqttUrl: process.env.MQTT_URL ?? "mqtt://localhost:1883",
    mqttUsername: process.env.MQTT_USERNAME || undefined,
    mqttPassword: process.env.MQTT_PASSWORD || undefined,
    bufferDir: process.env.COLLECTOR_BUFFER_DIR ?? "/data/collector-buffer",
    healthPort: num("COLLECTOR_HEALTH_PORT", 8081),
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN || undefined,
      allowedChatIds: allowed,
    },
    ha: {
      url: process.env.HA_URL || undefined,
      token: process.env.HA_TOKEN || undefined,
    },
  };
}
