-- 0001_init — events, incidents, devices + indexes.
-- Additive & idempotent (RULE 7). Never edit this file once applied; add a new
-- numbered forward migration instead.

-- events: the timeline. Append-mostly. `id` is the envelope id (dedupe key).
CREATE TABLE IF NOT EXISTS events (
  id             uuid PRIMARY KEY,
  ts             timestamptz NOT NULL,                 -- event time (UTC), NOT ingest time
  ingest_ts      timestamptz NOT NULL DEFAULT now(),   -- arrival time (UTC)
  source         text NOT NULL,
  kind           text NOT NULL,                        -- status|message|alert|command|note
  actor          text NOT NULL,                        -- system|nik|agent
  channel        text NOT NULL DEFAULT '-',
  severity       text NOT NULL DEFAULT 'info',
  body           text NOT NULL,
  entities       jsonb NOT NULL DEFAULT '[]',
  correlation_id uuid,
  tags           jsonb NOT NULL DEFAULT '[]',
  raw            jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS events_ts_brin ON events USING brin (ts);
CREATE INDEX IF NOT EXISTS events_ent_gin ON events USING gin (entities);
CREATE INDEX IF NOT EXISTS events_tag_gin ON events USING gin (tags);
CREATE INDEX IF NOT EXISTS events_corr    ON events (correlation_id);

-- incidents: correlation clusters. An incident is a tracking record.
CREATE TABLE IF NOT EXISTS incidents (
  id             uuid PRIMARY KEY,
  opened_at      timestamptz NOT NULL,
  closed_at      timestamptz,
  title          text NOT NULL,
  primary_entity text,
  severity       text NOT NULL DEFAULT 'info',
  status         text NOT NULL DEFAULT 'open'          -- open|ack|resolved
);
CREATE INDEX IF NOT EXISTS incidents_status ON incidents (status);
CREATE INDEX IF NOT EXISTS incidents_entity ON incidents (primary_entity);

-- devices: per-device non-admin tokens for the PWA (panel auth model).
CREATE TABLE IF NOT EXISTS devices (
  id          uuid PRIMARY KEY,
  label       text NOT NULL,
  token_hash  text NOT NULL,                           -- store hash, never the token
  scopes      jsonb NOT NULL DEFAULT '["read"]',
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);
CREATE INDEX IF NOT EXISTS devices_token_hash ON devices (token_hash);
