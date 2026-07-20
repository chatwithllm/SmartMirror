# AGENT_LEARNINGS

> Incident log for the Hermes build. On every incident (a test that should've passed, a
> runtime error, a wrong assumption): append here (what happened · root cause · fix), add a
> numbered `RULE N` to `agent-rules.md`, add an anti-pattern line, and update the done-gate if
> the rule adds a check. That is how a bug that cost time once never returns.

---

<!-- Append incidents below, newest last. Template:

## <date> — <short title> (task <id>)
- **What happened:** …
- **Root cause:** …
- **Fix:** …
- **Rule added / updated:** RULE N — …
-->

## 2026-07-20 — UUIDv5 namespace rejected as "Invalid UUID" (P2.1)
- **What happened:** `correlate.test.ts` threw `TypeError: Invalid UUID` from `uuidv5()`;
  a test that should have passed failed at the derivation call.
- **Root cause:** The chosen namespace constant had a version nibble (`d011…`) that the
  `uuid@11` library rejects during strict validation. A "looks-like-a-UUID" string is not
  necessarily a valid RFC-4122 UUID.
- **Fix:** Used a real RFC-4122 namespace (`6ba7b811-9dad-11d1-80b4-00c04fd430c8`). Derived
  ids (correlation/incident) stay deterministic.
- **Rule added:** RULE 13 — Derived ids must use library-valid seeds; verify against the
  actual library, not by eye.

## 2026-07-20 — SSE frames never reached the browser (P3.3)
- **What happened:** The `/api/stream` route replayed and enqueued events server-side (logs
  confirmed), but curl/EventSource received only `: connected` — no data frames until the
  connection closed. Live tail and resync both looked broken.
- **Root cause:** Next.js gzip compression buffers a `text/event-stream` response to compress
  it, so nothing flushes until the buffer fills or the stream ends. SSE needs immediate flush.
- **Fix:** `compress: false` in next.config.mjs (payloads are tiny LAN JSON). Verified frames
  now flush the instant they are enqueued.
- **Rule added:** RULE 14 — Streaming endpoints must defeat response buffering (disable gzip;
  verify a byte flushes before the stream ends).

## 2026-07-20 — EventSource connections silently 401'd (P3.1/P3.3)
- **What happened:** SSE worked with a curl `Authorization` header but the browser client
  (and the e2e using `?token=`) got 401 "missing device token". The stream stayed empty.
- **Root cause:** `EventSource` cannot set request headers, so the device token can only ride
  as a `?token=` query param — but the route only read the `Authorization` header.
- **Fix:** The stream route normalises `?token=` into a Bearer header before `authorize()`.
- **Rule added:** RULE 15 — For browser APIs that cannot set headers (EventSource), accept the
  auth token via query and normalise it before the auth check; test the exact client path.
