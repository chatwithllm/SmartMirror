import { type Envelope, type Severity, SEVERITY_RANK } from "@hermes/shared";

/**
 * Deterministic severity classification (DESIGN.md §5.4). Rules only — no LLM.
 * Starts from the envelope's declared severity and RAISES it per rule; never
 * lowers an explicitly-declared severity. Same input → same output (RULE 3).
 *
 * Rules:
 *  - kind `alert`            ⇒ at least warn (an alert is never info).
 *  - HA unavailable/unknown  ⇒ warn (a machine that went dark).
 *  - battery / SoC / charge   ⇒ warn under 20%, crit under 10%.
 */

const UNAVAILABLE_STATES = new Set(["unavailable", "unknown", "none", "offline"]);
const LOW_ENTITY = /(battery|soc|charge)/i;

function max(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

function numericState(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const state = (raw as { state?: unknown }).state;
  if (typeof state === "number") return state;
  if (typeof state === "string") {
    const n = Number(state);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function stateString(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const state = (raw as { state?: unknown }).state;
  return typeof state === "string" ? state.toLowerCase() : null;
}

export function classifySeverity(e: Envelope): Severity {
  let sev: Severity = e.severity;

  if (e.kind === "alert") sev = max(sev, "warn");

  const state = stateString(e.raw);
  if (state && UNAVAILABLE_STATES.has(state)) sev = max(sev, "warn");

  // Low-battery / low-SoC thresholds keyed off the entity name.
  const hasLowEntity =
    LOW_ENTITY.test(e.body) || e.entities.some((ent) => LOW_ENTITY.test(ent));
  if (hasLowEntity) {
    const value = numericState(e.raw);
    if (value != null) {
      if (value < 10) sev = max(sev, "crit");
      else if (value < 20) sev = max(sev, "warn");
    }
  }

  return sev;
}
