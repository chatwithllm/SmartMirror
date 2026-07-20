import { describe, it, expect } from "vitest";
import { makeEnvelope, type Envelope } from "@hermes/shared";
import { classifySeverity } from "../src/classify";

function ev(partial: Partial<Envelope> & Pick<Envelope, "kind">): Envelope {
  return makeEnvelope({
    id: "11111111-1111-4111-8111-111111111111",
    ts: "2026-07-20T04:00:00.000Z",
    source: "ha",
    actor: "system",
    body: "",
    ...partial,
  });
}

describe("classifySeverity", () => {
  it("keeps info for a normal status", () => {
    expect(classifySeverity(ev({ kind: "status", body: "sensor.temp → 21" }))).toBe("info");
  });

  it("raises an alert to at least warn", () => {
    expect(classifySeverity(ev({ kind: "alert", body: "door forced" }))).toBe("warn");
  });

  it("never lowers an explicitly-declared severity", () => {
    expect(classifySeverity(ev({ kind: "alert", severity: "crit", body: "fire" }))).toBe("crit");
  });

  it("warns when a machine goes unavailable", () => {
    const e = ev({ kind: "status", body: "sensor.gps → unavailable", raw: { state: "unavailable" } });
    expect(classifySeverity(e)).toBe("warn");
  });

  it("warns on low SoC (<20%)", () => {
    const e = ev({
      kind: "status",
      body: "sensor.ess_soc → 15",
      entities: ["sensor.ess_soc"],
      raw: { state: "15" },
    });
    expect(classifySeverity(e)).toBe("warn");
  });

  it("crits on very low battery (<10%)", () => {
    const e = ev({
      kind: "status",
      body: "sensor.node_battery → 7",
      entities: ["sensor.node_battery"],
      raw: { state: 7 },
    });
    expect(classifySeverity(e)).toBe("crit");
  });

  it("is deterministic", () => {
    const e = ev({ kind: "alert", body: "x", raw: { state: "unavailable" } });
    expect(classifySeverity(e)).toBe(classifySeverity(e));
  });
});
