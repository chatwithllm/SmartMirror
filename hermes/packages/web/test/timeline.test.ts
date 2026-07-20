import { describe, it, expect } from "vitest";
import { mergeEvents, maxSeqOf } from "../lib/timeline";
import { hashToken } from "../lib/auth";
import type { EventRow } from "../lib/db";

function row(seq: number, body = `e${seq}`): EventRow {
  return {
    seq,
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    ts: new Date(1_800_000_000_000 + seq * 1000).toISOString(),
    ingest_ts: new Date(1_800_000_000_000 + seq * 1000).toISOString(),
    source: "ha",
    kind: "status",
    actor: "system",
    channel: "-",
    severity: "info",
    body,
    entities: [],
    correlation_id: null,
    tags: [],
    raw: {},
  };
}

describe("mergeEvents — resync correctness (P3.5)", () => {
  it("keeps newest-first order", () => {
    const merged = mergeEvents([row(1)], [row(3), row(2)]);
    expect(merged.map((e) => e.seq)).toEqual([3, 2, 1]);
  });

  it("dedupes on seq: replayed + live overlap renders once", () => {
    const existing = [row(2), row(1)];
    // Simulate offline: 3 events generated (seq 3,4,5); reconnect replays them,
    // and the live tail re-sends 4,5 — overlap must not double-render.
    const replay = [row(3), row(4), row(5)];
    const liveOverlap = [row(4), row(5)];
    const merged = mergeEvents(mergeEvents(existing, replay), liveOverlap);
    expect(merged.map((e) => e.seq)).toEqual([5, 4, 3, 2, 1]);
    expect(new Set(merged.map((e) => e.seq)).size).toBe(merged.length); // no dups
  });

  it("no gap: all three missed events appear after resync", () => {
    const before = [row(2), row(1)];
    const missed = [row(3), row(4), row(5)];
    const merged = mergeEvents(before, missed);
    expect(merged.map((e) => e.seq)).toEqual([5, 4, 3, 2, 1]);
  });

  it("maxSeqOf returns the cursor to resume from", () => {
    expect(maxSeqOf([row(2), row(5), row(1)])).toBe(5);
    expect(maxSeqOf([])).toBe(0);
  });
});

describe("hashToken", () => {
  it("is stable and non-reversible (sha256 hex)", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });
});
