# AGENT RULES — BINDING, read before every task

> Each rule was locked by a real defect or a Hermes-specific hazard. Apply the tagged ones to your task. Re-grep every file you touch against these before committing.

**RULE 0 — Done means the done-gate, not a green build. [all]** `tsc` exit 0 is compile proof only. Run the full done-gate before reporting any task complete. Never hand me a manual smoke-test checklist — do the checks yourself.

**RULE 1 — Pre-flight against real code, not the plan. [all]** Before writing an endpoint, a bus topic string, an envelope field read, or an INSERT: grep the actual shape in `packages/shared` / the actual migration / the actual route. If reality contradicts the plan, STOP and report — don't silently follow either.

**RULE 2 — Envelope is the only contract. [all]** No job reads or writes a field not on the envelope zod schema. Validate at every boundary (publish, consume, persist). Mirror the schema key-for-key; don't invent nicer nesting. Malformed ⇒ `hermes/deadletter`, never a silent drop.

**RULE 3 — Idempotent ingest. [server][db]** QoS 1 ⇒ every consumer sees replays. Upsert on `envelope.id` (`ON CONFLICT DO NOTHING`). Correlation must be deterministic: same inputs ⇒ same `correlation_id`. No operation may double-count on replay.

**RULE 4 — Event + incident write share ONE transaction. [server][db]** Any write that records another (event + its incident open/attach, command + its response) runs in one transaction or one CTE. Either both land or neither. Never two independent `pool.query` calls.

**RULE 5 — Collector never blocks and never drops. [server]** Collector publishes to the bus only; it must not depend on Postgres or the Processor being up. Broker down ⇒ buffer to local disk and drain on reconnect. A human message is never lost.

**RULE 6 — Check constraints before every INSERT. [db][server]** Read the table def before writing an INSERT. Handle Postgres `23505` cleanly (409/skip), supply every `NOT NULL`, validate `CHECK`s first. Never let a constraint violation surface as a 500.

**RULE 7 — Migrations additive & idempotent; never edit an applied one. [db]** `IF NOT EXISTS` everywhere; new columns nullable or defaulted. Schema change ⇒ a new numbered forward migration. Regenerate `schema.sql`.

**RULE 8 — Every subscribe/poll/SSE cleans up. [client][server]** `useEffect` timers/EventSource return teardown. SSE server-side `LISTEN` is released on client disconnect; heartbeat every 15s; client reconnects with backoff. Never leak a listener past unmount/disconnect. Never touch `localStorage`/`sessionStorage` inside a Claude artifact — but IndexedDB in the real PWA is expected.

**RULE 9 — UTC in the DB, always. [all]** Store `timestamptz` in UTC; `ts` is event time, `ingest_ts` is arrival time — never conflate them. Local time is display only.

**RULE 10 — Secrets in env only. [all]** No token, HA long-lived token, DB/broker cred anywhere but `.env` (git-ignored). `.env.example` lists names only. If you catch a secret in code, strip it and note it.

**RULE 11 — Production is deploy-only. [all]** All changes tested on dev/staging first. Never run a migration or commit directly against prod. Stop and ask before anything that would touch a production surface.

**RULE 12 — Re-grep every touched file before commit. [all]** Before `git commit` on any file you edited, grep the whole file for live violations of the rules above and fix them in the SAME commit. A pre-existing violation in a file you touched is a regression in disguise.

**RULE 13 — Derived ids use library-valid seeds. [server]** UUIDv5 (or any derived id) must be seeded with a namespace the library actually accepts. Don't eyeball a UUID — validate it against the real library. Determinism is worthless if the call throws.

**ANTI-PATTERNS — never do these:** reading a field not on the envelope · decoding a bare array where the schema wraps · event and incident as two statements · `SELECT COUNT(*) … FOR UPDATE` (lock rows, count in code) · INSERT without reading constraints · editing an applied migration · SSE/effect with no teardown · storing local time · secret in source · fixing named lines and ignoring the rest of the file.

**OPEN SCARS (promote to a numbered rule on next recurrence):** *(none yet — projects add their own via the learning loop.)*
