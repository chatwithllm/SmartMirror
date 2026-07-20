# DESIGN — full spec

## 1. Architecture

```
 channels & telemetry          BUS (MQTT)                brain                    surface
 ┌───────────────┐      hermes/ingest/<source>     ┌──────────────┐         ┌──────────────┐
 │  COLLECTOR    │ ──QoS1──────────────────────▶   │  PROCESSOR   │──write─▶│   Postgres   │
 │ adapters +    │                                 │ enrich·class │         └──────┬───────┘
 │ pollers       │   ◀──hermes/egress/<channel>──  │ extract·corr │                │ SSE tail / query
 └───────────────┘         (escalations, replies)  │ persist·route│         ┌──────▼───────┐
        ▲                                           └──────┬───────┘         │   WEB/API    │
        │ commands routed back                             │ retained        │ Next.js 15   │
        └──────────────────────────────────────────────────┘ hermes/status/  │ PWA·SSE·REST │
                                                             <source> tiles   └──────────────┘
```

- **Collector → bus only.** Never blocks on the Processor or DB. If the broker is unreachable, buffer envelopes to a local disk queue and drain on reconnect — never drop a human message.
- **Processor is the only DB writer.** Idempotent upsert keyed on `envelope.id` (QoS 1 ⇒ replays happen).
- **Web reads DB + tails new events over an internal channel** (Postgres `LISTEN/NOTIFY` on insert, or the Processor also publishing `hermes/events/<severity>`; pick LISTEN/NOTIFY to avoid the web depending on the broker). SSE fans that out to browsers.
- **Retained `hermes/status/<source>`** messages hold latest-status for tiles so a fresh subscriber gets current state instantly.

## 2. Canonical envelope (shared zod schema — `packages/shared`)

| field | type | notes |
|---|---|---|
| `id` | uuid | producer-assigned; dedupe key |
| `ts` | ISO8601 UTC | event time, not ingest time |
| `source` | string | `telegram`, `ha`, `proxmox`, `meshtastic`… |
| `kind` | enum | `status \| message \| alert \| command \| note` |
| `actor` | enum | `system \| nik \| agent` |
| `channel` | string | transport the human used, or `-` for machine |
| `severity` | enum | `info \| warn \| error \| crit` |
| `body` | string | human-readable line |
| `entities` | string[] | extracted refs (`AOR-24`, `sensor.ess_soc`) |
| `correlation_id` | uuid \| null | assigned by Processor |
| `tags` | string[] | `project:aor-24`, `host:pve-node2` |
| `raw` | json | original payload for audit/replay |

Every boundary (publish, consume, persist) validates against this. A message that fails validation goes to a dead-letter topic `hermes/deadletter`, never silently dropped.

## 3. Bus topology (existing Mosquitto)

- **In:** `hermes/ingest/<source>` — Collector publishes, QoS 1.
- **Out:** `hermes/egress/<channel>` — Processor publishes escalations/replies; Collector's channel adapters subscribe and deliver.
- **Status tiles:** `hermes/status/<source>` — retained, QoS 1, latest-status per source.
- **Dead-letter:** `hermes/deadletter` — malformed/failed envelopes with the reason.
- **Command round-trip:** inbound `/status ha` arrives as a `command` envelope on `hermes/ingest/<channel>`; Processor executes, writes the `command` event + a `status`/`message` response event, and publishes the reply to `hermes/egress/<channel>`.

## 4. Persistence (Postgres)

```sql
-- events: the timeline. Append-mostly.
CREATE TABLE IF NOT EXISTS events (
  id             uuid PRIMARY KEY,               -- envelope.id, dedupe
  ts             timestamptz NOT NULL,
  ingest_ts      timestamptz NOT NULL DEFAULT now(),
  source         text NOT NULL,
  kind           text NOT NULL,                  -- status|message|alert|command|note
  actor          text NOT NULL,                  -- system|nik|agent
  channel        text NOT NULL DEFAULT '-',
  severity       text NOT NULL DEFAULT 'info',
  body           text NOT NULL,
  entities       jsonb NOT NULL DEFAULT '[]',
  correlation_id uuid,
  tags           jsonb NOT NULL DEFAULT '[]',
  raw            jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS events_ts_brin   ON events USING brin (ts);
CREATE INDEX IF NOT EXISTS events_ent_gin   ON events USING gin (entities);
CREATE INDEX IF NOT EXISTS events_tag_gin   ON events USING gin (tags);
CREATE INDEX IF NOT EXISTS events_corr      ON events (correlation_id);

-- incidents: correlation clusters. An incident IS a Phase-2 tracking record.
CREATE TABLE IF NOT EXISTS incidents (
  id            uuid PRIMARY KEY,
  opened_at     timestamptz NOT NULL,
  closed_at     timestamptz,
  title         text NOT NULL,
  primary_entity text,
  severity      text NOT NULL DEFAULT 'info',
  status        text NOT NULL DEFAULT 'open'      -- open|ack|resolved
);

-- devices: per-device non-admin tokens for the PWA (panel auth model).
CREATE TABLE IF NOT EXISTS devices (
  id          uuid PRIMARY KEY,
  label       text NOT NULL,
  token_hash  text NOT NULL,                      -- store hash, never the token
  scopes      jsonb NOT NULL DEFAULT '["read"]',
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);
```

- Insert is an **idempotent upsert** on `id` (`ON CONFLICT (id) DO NOTHING`) — QoS 1 replay-safe.
- When the Processor both writes an `event` and opens/updates its `incident`, **both writes run in ONE transaction** (audit-write-in-same-txn rule). Either both land or neither.

## 5. Processor pipeline (per envelope)

1. **Validate** against zod → fail ⇒ dead-letter.
2. **Dedupe** — upsert probe on `id`; already-seen ⇒ ack + drop.
3. **Extract entities** — dictionary + regex over `body` and `raw` (host names, `sensor.*`, project codes). Deterministic.
4. **Classify severity** — rules by source/kind (HA `unavailable` ⇒ warn; battery/SoC thresholds ⇒ warn/crit; explicit alert kind carries through).
5. **Correlate** — for `note`/`command`/`alert` events, look back `CORRELATION_WINDOW` (default 300s) for events sharing ≥1 entity; if found, adopt/assign a shared `correlation_id` and open/attach an `incident`. **Deterministic**: re-running over the same events yields the same clusters.
6. **Persist** — event + incident in one transaction.
7. **Notify** — `pg_notify('hermes_events', <id>)` for the web tail; publish retained `hermes/status/<source>`.
8. **Route** — if `severity >= ROUTE_THRESHOLD` or it's a command reply, publish to `hermes/egress/<channel>`.

## 6. Web / API (Next.js 15)

- **PWA:** App Router, valid `manifest.webmanifest`, service worker (Workbox or hand-rolled) caching the shell; **IndexedDB** holds the last N events for offline render.
- **Timeline:** server component for initial page (last N events, newest-first), then **SSE** (`/api/stream`) for live tail. SSE emits `id:` per event; client stores the last id.
- **Offline→online resync:** on reconnect the client sends `Last-Event-ID`; the server replays events with `id`/`ts` after that cursor, then resumes live. No dup (client dedupes on event id), no gap.
- **Command endpoint:** `POST /api/command` (device-token auth) publishes a `command` envelope to the bus; the reply arrives back through the normal event stream.
- **Auth:** trust the reverse-proxy identity header; app-level per-device token (hash-checked against `devices`) gates `/api/*`. Browser never holds an admin token.
- **SSE hygiene:** heartbeat comment every 15s; server cleans up the DB `LISTEN` on client disconnect; client `EventSource` closes and reconnects with backoff. (Every subscribe/poll cleans up.)

## 7. Docker

- **One image** (`Dockerfile`), three entrypoints selected by `HERMES_ROLE=collector|processor|web`.
- `docker-compose.yml`: `postgres`, `mosquitto` (or `external: true` to attach to the existing broker via env), `hermes-collector`, `hermes-processor`, `hermes-web`. Healthchecks on all. Web depends_on processor+postgres healthy.
- Secrets from env/`.env` only. `.env.example` documents: `DATABASE_URL`, `MQTT_URL`, `HA_URL`, `HA_TOKEN`, `TELEGRAM_BOT_TOKEN`, `PROXY_IDENTITY_HEADER`, `CORRELATION_WINDOW`, `ROUTE_THRESHOLD`.

## 8. Adapter interface (so stubs are trivial and real ones are uniform)

```ts
export interface ChannelAdapter {           // human, bidirectional
  name: string;
  start(publish: (e: Envelope) => void): Promise<void>;   // inbound → bus
  deliver(e: Envelope): Promise<void>;                     // egress → channel
  health(): AdapterHealth;
}
export interface TelemetrySource {          // machine, inbound-only
  name: string;
  start(publish: (e: Envelope) => void): Promise<void>;
  health(): AdapterHealth;
}
```

A stub implements the interface, publishes nothing, and reports `health: 'stub'`. Shipping = Telegram (ChannelAdapter) + HA WebSocket (TelemetrySource).
