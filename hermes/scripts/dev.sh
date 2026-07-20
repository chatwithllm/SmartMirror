#!/usr/bin/env bash
# Local dev: run all three jobs against a locally running postgres + mosquitto.
# Assumes DATABASE_URL and MQTT_URL are set (see .env.example) and migrations
# have been applied (pnpm migrate).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Starting collector, processor, web …"
HERMES_ROLE=processor pnpm --filter @hermes/processor start &
HERMES_ROLE=collector pnpm --filter @hermes/collector start &
pnpm --filter @hermes/web dev &
wait
