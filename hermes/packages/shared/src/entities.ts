/**
 * Deterministic, rule + dictionary based entity extraction (DESIGN.md §5.3).
 * NOT an LLM call in v1. Same input → same output, always (RULE 3).
 *
 * Entity refs are opaque strings like `AOR-24`, `pve-node2`, `sensor.ess_soc`,
 * `frigate.driveway`. Extraction runs over an event's `body` and its `raw`.
 */

/**
 * Seed dictionary of known entity refs. Matched case-insensitively as whole
 * tokens. Extend per deployment; extraction never depends on this being
 * complete because the regex rules catch structured refs too.
 */
export const ENTITY_DICTIONARY: readonly string[] = [
  "AOR-24",
  "pve-node1",
  "pve-node2",
  "pve-node3",
  "sensor.ess_soc",
  "frigate.driveway",
];

/**
 * Structured-ref patterns. Order-independent; results are deduped + sorted so
 * output is stable regardless of match order.
 *
 * - HA entity id:   domain.object_id  (sensor.ess_soc, binary_sensor.door_1)
 * - Host / node:    pve-node2, nas-01, host-style lowercase-with-digits-dash
 * - Project code:   AOR-24 (UPPER letters, dash, digits)
 */
const HA_ENTITY = /\b[a-z][a-z0-9_]*\.[a-z0-9_]+\b/g;
const HOST_REF = /\b(?:pve|nas|node|host|rpi|nuc)-[a-z0-9]+\b/gi;
const PROJECT_CODE = /\b[A-Z]{2,5}-\d{1,5}\b/g;

const RULES: RegExp[] = [HA_ENTITY, HOST_REF, PROJECT_CODE];

function collectRegex(text: string, out: Set<string>): void {
  for (const rule of RULES) {
    // Reset lastIndex — these are module-level /g regexes reused across calls.
    rule.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.exec(text)) !== null) {
      out.add(m[0]);
    }
  }
}

function collectDictionary(text: string, out: Set<string>): void {
  const haystack = text.toLowerCase();
  for (const ref of ENTITY_DICTIONARY) {
    if (haystack.includes(ref.toLowerCase())) out.add(ref);
  }
}

/**
 * Flatten arbitrary JSON into a searchable string so entity refs buried in a
 * `raw` payload (e.g. HA `entity_id`) are still caught.
 */
function flatten(value: unknown, depth = 0): string {
  if (depth > 6 || value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => flatten(v, depth + 1)).join(" ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k} ${flatten(v, depth + 1)}`)
      .join(" ");
  }
  return "";
}

/**
 * Extract entity refs from a body string and (optionally) a raw payload.
 * Returns a deduped, lexicographically sorted array — deterministic.
 */
export function extractEntities(body: string, raw?: unknown): string[] {
  const out = new Set<string>();
  const text = raw === undefined ? body : `${body} ${flatten(raw)}`;
  collectRegex(text, out);
  collectDictionary(text, out);
  return [...out].sort();
}
