# PLAN — phased, checkboxed

> Execute in order. Each `- [ ]` is one task = one subagent = one commit, gated. Check it off in this file when the done-gate passes.

### Phase 0 — Skeleton & plumbing
- [x] P0.1 pnpm workspace, tsconfig strict, eslint, vitest, per-package `typecheck/lint/test/build` scripts.
- [x] P0.2 `packages/shared`: envelope **zod schema** + inferred types + entity dictionary + `validateEnvelope()`; unit tests for valid/invalid/dead-letter cases.
- [x] P0.3 `docker-compose.yml` with postgres + mosquitto + three empty job services (each just logs role + health), all healthy on `up`.
- [x] P0.4 `db/migrations/0001_init.sql` (events, incidents, devices + indexes); migration runner; `schema.sql` regenerated.

### Phase 1 — Spine (one human + one machine source end-to-end)
- [x] P1.1 Collector core: MQTT publisher (QoS 1), disk-buffer on broker-down + drain on reconnect, adapter registry, `/health`.
- [x] P1.2 **Telegram** ChannelAdapter: inbound messages → envelope → bus; egress subscribe → deliver reply.
- [x] P1.3 **HA WebSocket** TelemetrySource: subscribe to state changes → envelope (`actor:system`) → bus.
- [x] P1.4 Processor core: bus consumer, zod validate, dead-letter path, idempotent upsert on `id`, `pg_notify`.
- [x] P1.5 Entity extraction (dictionary+regex) + severity classification rules; unit tests with fixture envelopes.
- [x] P1.6 Persist event; publish retained `hermes/status/<source>`. Verify a Telegram msg and an HA change both land in `events`.

### Phase 2 — Correlation & incidents
- [x] P2.1 Correlator: look-back window, entity-overlap match, deterministic `correlation_id` assignment; event+incident write in ONE transaction.
- [x] P2.2 Incident open/attach/close lifecycle; tests proving re-run over same events yields identical clusters (idempotent).
- [x] P2.3 Command round-trip: `/status ha` command envelope → Processor executes an HA query → writes command + response events → egress reply. Logs the whole exchange.

### Phase 3 — Surface (PWA)
- [x] P3.1 Next.js 15 app; Auth.js v5 + proxy-header trust + per-device token check on `/api/*`; `devices` token issue/revoke script.
- [x] P3.2 Timeline: server-rendered initial page (last N, newest-first) with interleaved human/machine rows + incident grouping.
- [x] P3.3 SSE `/api/stream` off `LISTEN hermes_events`; `id:` per event; heartbeat; disconnect cleanup.
- [x] P3.4 PWA: manifest + service worker + IndexedDB cache; installable.
- [x] P3.5 Offline→online resync via `Last-Event-ID` cursor replay; test: kill network, generate 3 events, restore → all 3 appear once, in order.
- [x] P3.6 `POST /api/command` → bus; reply surfaces through the stream.

### Phase 4 — Stubs, hardening, ship
- [x] P4.1 Stub adapters (Signal, Discord, IMAP, Meshtastic, Proxmox, UniFi, Frigate) implementing the interface, `health:'stub'`.
- [ ] P4.2 Overnight **digest/replay**: reconstruct a written "what happened" brief from the log over a time range.
- [ ] P4.3 `README.md` (env, `docker compose up`, register channel, issue device token); full-stack smoke against Target State; final done-gate.
