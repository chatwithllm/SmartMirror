import type { Kind, Actor, Severity } from "@hermes/shared";

/**
 * Overnight digest / replay (PLAN P4.2). Reconstructs a written "what happened"
 * brief from the log over a time range. Pure and deterministic so it is
 * unit-testable and re-runnable — same events in, same brief out.
 */

export interface DigestEvent {
  ts: string;
  source: string;
  kind: Kind;
  actor: Actor;
  severity: Severity;
  body: string;
  entities: string[];
  correlation_id: string | null;
}

export interface DigestIncident {
  id: string;
  opened_at: string;
  primary_entity: string | null;
  severity: Severity;
  status: string;
}

export interface DigestRange {
  from: string;
  to: string;
}

const SEV_ORDER: Severity[] = ["crit", "error", "warn", "info"];

function tally<T extends string>(items: T[]): Array<[T, number]> {
  const m = new Map<T, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

function hhmm(ts: string): string {
  return new Date(ts).toISOString().slice(11, 16) + "Z";
}

export function buildDigest(
  events: DigestEvent[],
  incidents: DigestIncident[],
  range: DigestRange,
): string {
  const lines: string[] = [];
  lines.push(`# Hermes digest — ${range.from} → ${range.to}`);
  lines.push("");

  if (events.length === 0) {
    lines.push("_Nothing recorded in this window._");
    return lines.join("\n");
  }

  lines.push(`**${events.length} events** across ${new Set(events.map((e) => e.source)).size} source(s).`);
  lines.push("");

  lines.push("## By source");
  for (const [src, n] of tally(events.map((e) => e.source))) lines.push(`- ${src}: ${n}`);
  lines.push("");

  lines.push("## By severity");
  const bySev = new Map(tally(events.map((e) => e.severity)));
  for (const sev of SEV_ORDER) if (bySev.has(sev)) lines.push(`- ${sev}: ${bySev.get(sev)}`);
  lines.push("");

  const opened = incidents
    .filter((i) => i.opened_at >= range.from && i.opened_at <= range.to)
    .sort((a, b) => (a.opened_at < b.opened_at ? -1 : 1));
  lines.push(`## Incidents (${opened.length})`);
  if (opened.length === 0) lines.push("- none opened in window");
  for (const inc of opened) {
    const members = events.filter((e) => e.correlation_id === inc.id).length;
    lines.push(
      `- ${hhmm(inc.opened_at)} [${inc.severity}] ${inc.primary_entity ?? "?"} — ${members} correlated event(s), ${inc.status}`,
    );
  }
  lines.push("");

  const notable = events
    .filter((e) => e.severity === "warn" || e.severity === "error" || e.severity === "crit")
    .sort((a, b) => (a.ts < b.ts ? -1 : 1));
  lines.push(`## Notable (${notable.length})`);
  if (notable.length === 0) lines.push("- nothing above info");
  for (const e of notable) lines.push(`- ${hhmm(e.ts)} [${e.severity}] ${e.source}: ${e.body}`);
  lines.push("");

  const notes = events
    .filter((e) => e.actor === "nik" && (e.kind === "note" || e.kind === "message"))
    .sort((a, b) => (a.ts < b.ts ? -1 : 1));
  lines.push(`## Your notes (${notes.length})`);
  if (notes.length === 0) lines.push("- none");
  for (const e of notes) lines.push(`- ${hhmm(e.ts)} ${e.body}`);

  return lines.join("\n");
}
