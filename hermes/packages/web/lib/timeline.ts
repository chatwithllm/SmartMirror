import type { EventRow } from "./db";

/**
 * Pure timeline merge — the correctness core of offline→online resync
 * (DESIGN §6, PLAN P3.5). Dedupes on `seq` so replayed + live events never
 * double-render, and keeps newest-first order so there are no gaps. Isomorphic
 * (no DOM) so it is unit-testable.
 */
export function mergeEvents(existing: EventRow[], incoming: EventRow[]): EventRow[] {
  const bySeq = new Map<number, EventRow>();
  for (const e of existing) bySeq.set(e.seq, e);
  for (const e of incoming) bySeq.set(e.seq, e); // incoming wins on conflict
  return [...bySeq.values()].sort((a, b) => b.seq - a.seq);
}

export function maxSeqOf(events: EventRow[]): number {
  return events.reduce((m, e) => (e.seq > m ? e.seq : m), 0);
}
