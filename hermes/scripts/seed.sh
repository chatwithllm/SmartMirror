#!/usr/bin/env bash
# Seed a few demo events straight onto the bus so the timeline has content
# without a live Telegram/HA connection. Requires MQTT_URL.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${MQTT_URL:?set MQTT_URL}"
exec tsx scripts/seed.ts
