# Hermes

Self-hosted homelab **observability + journaling** on one causal timeline. Hermes
interleaves **machine telemetry** and **your own messages across channels** into a single
event stream, auto-correlates a human note with the machine event that follows it into one
incident, and serves the whole thing as an installable, offline-capable PWA.

> The defining property: a note ("swapping the LC29H antenna") and the machine event that
> follows it (RTK fix drops 40s later) land on the **same timeline** and are correlated into
> **one incident**. Logging system events and chat scrollback in separate places is the
> failure mode Hermes exists to kill.

See [`DESIGN.md`](./DESIGN.md) for the full spec, [`PLAN.md`](./PLAN.md) for the build plan,
and [`agent-rules.md`](./agent-rules.md) for the engineering rules.

## Architecture

Three jobs from **one image**, plus Postgres and an MQTT broker:

| Job | Role |
|---|---|
| **Collector** | Channel adapters + telemetry pollers. Normalises every source into the canonical envelope and publishes to the bus at QoS 1. Never touches Postgres; buffers to disk if the broker is down. |
| **Processor** | The brain. Consumes the bus, validates, extracts entities, classifies severity, correlates into incidents, persists to Postgres (one transaction per event+incident), routes escalations/command replies back out. The only DB writer. |
| **Web/API** | Next.js 15 PWA. Server-rendered timeline, an **SSE** live tail off Postgres `LISTEN/NOTIFY`, and a device-token-gated REST command endpoint. |

The **only** inter-job contract is the canonical envelope (`packages/shared`):

```
{ id, ts, source, kind(status|message|alert|command|note),
  actor(system|nik|agent), channel, severity(info|warn|error|crit),
  body, entities[], correlation_id, tags[], raw }
```

Bus topics: `hermes/ingest/<source>` (in), `hermes/egress/<channel>` (out),
`hermes/status/<source>` (retained tiles), `hermes/deadletter` (malformed).

## Quick start (Docker)

```bash
cp .env.example .env      # fill in real values — .env is git-ignored
docker compose up --build
```

Brings up five services to healthy: `postgres`, `mosquitto`, `hermes-collector`,
`hermes-processor`, `hermes-web`. The processor applies pending DB migrations on start.
Open the PWA at `http://<host>:3000`.

To reuse an **existing** LAN broker instead of the bundled one, point `MQTT_URL` at it and
remove the `mosquitto` service from `docker-compose.yml`. Hermes only ever connects as a
client — it never reconfigures your broker, Home Assistant, or any other homelab service.

## Environment variables

Names only — see [`.env.example`](./.env.example). Never commit real secrets.

| Var | Used by | Meaning |
|---|---|---|
| `DATABASE_URL` | processor, web | Postgres connection string |
| `MQTT_URL` (+ `MQTT_USERNAME`/`MQTT_PASSWORD`) | collector, processor, web | Broker |
| `HA_URL`, `HA_TOKEN` | collector, processor | Home Assistant WS + REST |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_IDS` | collector | Telegram bot |
| `PROXY_IDENTITY_HEADER` | web | Trusted identity header from the reverse proxy |
| `CORRELATION_WINDOW` | processor | Look-back seconds for correlation (default 300) |
| `ROUTE_THRESHOLD` | processor | Min severity routed to egress (default `warn`) |
| `COLLECTOR_BUFFER_DIR` | collector | Disk spool for broker-down buffering |

## Register a channel (Telegram)

1. Create a bot with [@BotFather](https://t.me/BotFather); put the token in `TELEGRAM_BOT_TOKEN`.
2. (Optional) restrict access: set `TELEGRAM_ALLOWED_CHAT_IDS` to comma-separated chat ids.
3. Restart the collector. Message the bot — it appears in the timeline within ~3s tagged
   `actor:nik`, `kind:message`, `channel:telegram`.
4. Text `/status ha` to get an inline reply; the exchange is logged as a `command` event plus
   its response.

Other channels (Signal, Discord, IMAP, Meshtastic) and machine sources (Proxmox, UniFi,
Frigate) ship as **stubs** implementing the adapter interface — wire them up as needed.

## Issue a device token (PWA auth)

The PWA sits behind an authenticating reverse proxy; the app additionally gates every
`/api/*` call with a per-device token (hashed in the `devices` table — the plaintext is never
stored, and the browser never holds an admin token).

```bash
# read-only token
pnpm --filter @hermes/web issue-token issue "kitchen ipad"
# read+write (can send commands)
pnpm --filter @hermes/web issue-token issue "my phone" --write

pnpm --filter @hermes/web issue-token list
pnpm --filter @hermes/web issue-token revoke <device-id>
```

The token is printed **once**. Paste it into the PWA banner to enable the live tail and
commands.

## Local development (no Docker)

```bash
pnpm install
export DATABASE_URL=postgres://hermes:hermes@localhost:5432/hermes
export MQTT_URL=mqtt://localhost:1883
pnpm migrate          # apply db/migrations
pnpm dev              # runs collector + processor + web
pnpm seed             # optional: push demo events onto the bus
```

Overnight brief of what happened:

```bash
pnpm exec tsx scripts/digest.ts --hours 12
```

## Quality gates

```bash
pnpm -w typecheck     # strict TS across all packages
pnpm -w lint
pnpm -w test          # unit + integration (needs a reachable Postgres for the spine suite)
```

## Deployment standing rule

Production is **deploy-only**. All changes are committed and tested on dev/staging first.
Never run a migration or commit directly against prod.
