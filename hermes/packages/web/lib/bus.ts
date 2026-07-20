import mqtt, { type MqttClient } from "mqtt";
import { type Envelope, ingestTopic } from "@hermes/shared";

/**
 * Web → bus publisher for commands only. A `POST /api/command` publishes a
 * `command` envelope onto `hermes/ingest/<channel>`; the reply arrives back
 * through the normal event stream (DESIGN §6). The web never touches egress or
 * the DB write path.
 */

let client: MqttClient | null = null;

function getClient(): MqttClient {
  if (!client) {
    const url = process.env.MQTT_URL ?? "mqtt://localhost:1883";
    client = mqtt.connect(url, {
      username: process.env.MQTT_USERNAME || undefined,
      password: process.env.MQTT_PASSWORD || undefined,
      reconnectPeriod: 2000,
    });
    client.on("error", (err) => console.error("[web-bus] error:", err.message));
  }
  return client;
}

export function publishCommand(e: Envelope): Promise<void> {
  return new Promise((resolve, reject) => {
    getClient().publish(ingestTopic(e.source), JSON.stringify(e), { qos: 1 }, (err) =>
      err ? reject(err) : resolve(),
    );
  });
}
