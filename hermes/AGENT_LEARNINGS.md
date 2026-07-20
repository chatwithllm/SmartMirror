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
