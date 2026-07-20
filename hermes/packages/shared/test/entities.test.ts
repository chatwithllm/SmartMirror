import { describe, it, expect } from "vitest";
import { extractEntities } from "../src/entities";

describe("extractEntities", () => {
  it("extracts HA entity ids from a body", () => {
    expect(extractEntities("sensor.ess_soc dropped to 12%")).toContain("sensor.ess_soc");
  });

  it("extracts host / node refs", () => {
    const e = extractEntities("rebooting pve-node2 now");
    expect(e).toContain("pve-node2");
  });

  it("extracts project codes", () => {
    expect(extractEntities("swapping the LC29H antenna on AOR-24")).toContain("AOR-24");
  });

  it("digs entity ids out of a raw payload", () => {
    const e = extractEntities("state changed", {
      entity_id: "binary_sensor.driveway_motion",
      new_state: { state: "on" },
    });
    expect(e).toContain("binary_sensor.driveway_motion");
  });

  it("is deterministic: same input yields identical, sorted, deduped output", () => {
    const text = "AOR-24 and sensor.ess_soc and AOR-24 again on pve-node2";
    const a = extractEntities(text);
    const b = extractEntities(text);
    expect(a).toEqual(b);
    expect(a).toEqual([...a].sort());
    expect(new Set(a).size).toBe(a.length);
  });

  it("returns an empty array when nothing matches", () => {
    expect(extractEntities("just a plain human sentence")).toEqual([]);
  });
});
