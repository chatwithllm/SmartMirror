import { describe, it, expect } from "vitest";
import {
  validateEnvelope,
  makeEnvelope,
  severityAtLeast,
  EnvelopeSchema,
} from "../src/envelope";

const base = {
  id: "11111111-1111-4111-8111-111111111111",
  ts: "2026-07-20T04:00:00.000Z",
  source: "telegram",
  kind: "message",
  actor: "nik",
  body: "hello",
} as const;

describe("validateEnvelope", () => {
  it("accepts a valid envelope and applies defaults", () => {
    const res = validateEnvelope(base);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.envelope.channel).toBe("-");
      expect(res.envelope.severity).toBe("info");
      expect(res.envelope.entities).toEqual([]);
      expect(res.envelope.correlation_id).toBeNull();
      expect(res.envelope.tags).toEqual([]);
    }
  });

  it("rejects a non-uuid id with a dead-letter reason", () => {
    const res = validateEnvelope({ ...base, id: "not-a-uuid" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toContain("id");
      expect(res.issues.length).toBeGreaterThan(0);
    }
  });

  it("rejects an unknown kind", () => {
    const res = validateEnvelope({ ...base, kind: "explosion" });
    expect(res.ok).toBe(false);
  });

  it("rejects a non-UTC / offset-less timestamp", () => {
    const res = validateEnvelope({ ...base, ts: "2026-07-20 04:00:00" });
    expect(res.ok).toBe(false);
  });

  it("rejects unknown extra fields (strict contract)", () => {
    const res = validateEnvelope({ ...base, nickname: "extra" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason.toLowerCase()).toContain("unrecognized");
  });

  it("rejects a completely malformed payload (dead-letter case)", () => {
    expect(validateEnvelope(null).ok).toBe(false);
    expect(validateEnvelope("garbage").ok).toBe(false);
    expect(validateEnvelope([]).ok).toBe(false);
  });
});

describe("makeEnvelope", () => {
  it("fills defaults and returns a fully-formed envelope", () => {
    const e = makeEnvelope(base);
    expect(e.severity).toBe("info");
    expect(EnvelopeSchema.safeParse(e).success).toBe(true);
  });

  it("throws on invalid producer input", () => {
    expect(() => makeEnvelope({ ...base, actor: "robot" } as never)).toThrow();
  });
});

describe("severityAtLeast", () => {
  it("orders the severity ladder", () => {
    expect(severityAtLeast("warn", "info")).toBe(true);
    expect(severityAtLeast("info", "warn")).toBe(false);
    expect(severityAtLeast("crit", "crit")).toBe(true);
    expect(severityAtLeast("error", "warn")).toBe(true);
  });
});
