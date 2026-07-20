import { describe, it, expect } from "vitest";
import { buildDigest, type DigestEvent, type DigestIncident } from "../src/digest";

const range = { from: "2026-07-19T20:00:00.000Z", to: "2026-07-20T08:00:00.000Z" };

function ev(p: Partial<DigestEvent> & Pick<DigestEvent, "ts" | "body">): DigestEvent {
  return {
    source: "ha",
    kind: "status",
    actor: "system",
    severity: "info",
    entities: [],
    correlation_id: null,
    ...p,
  };
}

describe("buildDigest", () => {
  it("reports an empty window plainly", () => {
    expect(buildDigest([], [], range)).toContain("Nothing recorded");
  });

  it("summarizes counts, incidents, notable events, and human notes", () => {
    const events: DigestEvent[] = [
      ev({ ts: "2026-07-19T22:00:00.000Z", body: "swapping LC29H antenna on AOR-24", source: "telegram", kind: "note", actor: "nik", entities: ["AOR-24"], correlation_id: "inc-1" }),
      ev({ ts: "2026-07-19T22:00:40.000Z", body: "AOR-24 rtk fix lost", kind: "alert", severity: "warn", entities: ["AOR-24"], correlation_id: "inc-1" }),
      ev({ ts: "2026-07-19T23:00:00.000Z", body: "sensor.temp → 21" }),
    ];
    const incidents: DigestIncident[] = [
      { id: "inc-1", opened_at: "2026-07-19T22:00:00.000Z", primary_entity: "AOR-24", severity: "warn", status: "open" },
    ];
    const out = buildDigest(events, incidents, range);
    expect(out).toContain("3 events");
    expect(out).toContain("Incidents (1)");
    expect(out).toContain("AOR-24 — 2 correlated event(s), open");
    expect(out).toContain("[warn] ha: AOR-24 rtk fix lost");
    expect(out).toContain("swapping LC29H antenna on AOR-24");
  });

  it("is deterministic", () => {
    const events = [ev({ ts: "2026-07-19T22:00:00.000Z", body: "x", severity: "warn" })];
    expect(buildDigest(events, [], range)).toBe(buildDigest(events, [], range));
  });
});
