import { describe, it, expect } from "vitest";
import {
  decideCorrelation,
  clusterId,
  type CorrelationCandidate,
  type CorrelationInput,
} from "../src/correlate";

const note: CorrelationInput = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ts: "2026-07-20T04:00:00.000Z",
  entities: ["AOR-24"],
  severity: "info",
};

describe("decideCorrelation", () => {
  it("returns none when the event has no entities", () => {
    expect(decideCorrelation({ ...note, entities: [] }, [])).toEqual({ kind: "none" });
  });

  it("returns none when nothing shares an entity", () => {
    const cand: CorrelationCandidate = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ts: "2026-07-20T03:59:00.000Z",
      entities: ["sensor.unrelated"],
      correlation_id: null,
      severity: "info",
    };
    expect(decideCorrelation(note, [cand])).toEqual({ kind: "none" });
  });

  it("opens a new incident anchored on the earliest matching event", () => {
    const prior: CorrelationCandidate = {
      id: "00000000-0000-4000-8000-000000000001",
      ts: "2026-07-20T03:59:00.000Z",
      entities: ["AOR-24", "sensor.ess_soc"],
      correlation_id: null,
      severity: "warn",
    };
    const d = decideCorrelation(note, [prior]);
    expect(d.kind).toBe("open");
    if (d.kind === "open") {
      expect(d.anchorId).toBe(prior.id);
      expect(d.correlationId).toBe(clusterId(prior.id));
      expect(d.primaryEntity).toBe("AOR-24");
      expect(d.incidentSeverity).toBe("warn");
      expect(d.openedAt).toBe(prior.ts);
    }
  });

  it("attaches to an existing cluster and bumps severity", () => {
    const existing: CorrelationCandidate = {
      id: "00000000-0000-4000-8000-000000000002",
      ts: "2026-07-20T03:59:30.000Z",
      entities: ["AOR-24"],
      correlation_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      severity: "info",
    };
    const d = decideCorrelation({ ...note, severity: "error" }, [existing]);
    expect(d.kind).toBe("attach");
    if (d.kind === "attach") {
      expect(d.correlationId).toBe(existing.correlation_id);
      expect(d.incidentSeverity).toBe("error");
    }
  });

  it("is deterministic and order-independent for cluster assignment", () => {
    const a: CorrelationCandidate = {
      id: "00000000-0000-4000-8000-00000000000a",
      ts: "2026-07-20T03:58:00.000Z",
      entities: ["AOR-24"],
      correlation_id: null,
      severity: "info",
    };
    const b: CorrelationCandidate = {
      id: "00000000-0000-4000-8000-00000000000b",
      ts: "2026-07-20T03:59:00.000Z",
      entities: ["AOR-24"],
      correlation_id: null,
      severity: "info",
    };
    const d1 = decideCorrelation(note, [a, b]);
    const d2 = decideCorrelation(note, [b, a]);
    expect(d1).toEqual(d2);
    if (d1.kind === "open") expect(d1.anchorId).toBe(a.id); // earliest wins
  });
});
