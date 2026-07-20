import { v5 as uuidv5 } from "uuid";
import { type Severity, SEVERITY_RANK } from "@hermes/shared";

/**
 * Deterministic correlation (DESIGN.md §5.5). Given a new event and the prior
 * events within the look-back window that share ≥1 entity, decide whether the
 * new event opens a new incident, attaches to an existing one, or stands alone.
 *
 * An incident IS the correlation cluster: `incidents.id === events.correlation_id`.
 * The cluster id is derived with UUIDv5 from the anchor (earliest) event id, so
 * the same event stream always yields the same cluster ids (RULE 3). Because
 * ingest dedupes on `envelope.id`, replays never re-run this and never
 * double-count.
 *
 * v1 scope: a new event joins the single earliest matching cluster; it does not
 * merge two distinct pre-existing clusters (bridging). Noted as a known limit.
 */

// Fixed namespace so derived ids are stable across processes/deployments.
// (The standard RFC-4122 URL namespace — any valid UUID works as the seed.)
const HERMES_NS = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";

export interface CorrelationCandidate {
  id: string;
  ts: string;
  entities: string[];
  correlation_id: string | null;
  severity: Severity;
}

export interface CorrelationInput {
  id: string;
  ts: string;
  entities: string[];
  severity: Severity;
}

export type CorrelationDecision =
  | { kind: "none" }
  | {
      kind: "attach";
      correlationId: string;
      incidentSeverity: Severity;
    }
  | {
      kind: "open";
      correlationId: string;
      anchorId: string;
      openedAt: string;
      primaryEntity: string;
      incidentSeverity: Severity;
    };

export function clusterId(anchorId: string): string {
  return uuidv5(`cluster:${anchorId}`, HERMES_NS);
}

function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

function sharedEntities(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  return a.filter((e) => setB.has(e)).sort();
}

/** Sort candidates deterministically: earliest ts first, then id. */
function ordered(cands: CorrelationCandidate[]): CorrelationCandidate[] {
  return [...cands].sort((x, y) => (x.ts < y.ts ? -1 : x.ts > y.ts ? 1 : x.id < y.id ? -1 : 1));
}

export function decideCorrelation(
  event: CorrelationInput,
  candidates: CorrelationCandidate[],
): CorrelationDecision {
  if (event.entities.length === 0) return { kind: "none" };

  const matching = ordered(
    candidates.filter((c) => c.id !== event.id && sharedEntities(c.entities, event.entities).length > 0),
  );
  if (matching.length === 0) return { kind: "none" };

  // Attach to an existing cluster if any matching candidate already has one.
  const withCluster = matching.find((c) => c.correlation_id !== null);
  if (withCluster && withCluster.correlation_id) {
    const clusterSev = matching
      .filter((c) => c.correlation_id === withCluster.correlation_id)
      .reduce<Severity>((s, c) => maxSeverity(s, c.severity), event.severity);
    return {
      kind: "attach",
      correlationId: withCluster.correlation_id,
      incidentSeverity: clusterSev,
    };
  }

  // Otherwise open a fresh cluster anchored on the earliest matching event.
  const anchor = matching[0]!;
  const shared = sharedEntities(anchor.entities, event.entities);
  return {
    kind: "open",
    correlationId: clusterId(anchor.id),
    anchorId: anchor.id,
    openedAt: anchor.ts < event.ts ? anchor.ts : event.ts,
    primaryEntity: shared[0] ?? event.entities[0]!,
    incidentSeverity: maxSeverity(anchor.severity, event.severity),
  };
}
