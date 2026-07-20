import { type Envelope } from "@hermes/shared";
import type { Db } from "./db";

export interface CommandContext {
  db: Db;
  ha: { url?: string; token?: string };
}

/**
 * Execute a `command` envelope and return the human-readable reply body.
 * Commands are the interactive surface (DESIGN §3 command round-trip). Kept
 * deterministic and side-effect-free apart from read-only queries; the caller
 * persists the command + response together in one transaction (RULE 4).
 */
export async function executeCommand(e: Envelope, ctx: CommandContext): Promise<string> {
  const parts = e.body.trim().replace(/^\//, "").split(/\s+/);
  const cmd = (parts[0] ?? "").toLowerCase();
  const arg = (parts[1] ?? "").toLowerCase();

  if (cmd === "status") {
    if (arg === "ha") return statusHa(ctx);
    if (!arg) return "Usage: /status <ha>";
    return `No status provider for "${arg}". Try: /status ha`;
  }
  if (cmd === "help" || cmd === "") {
    return "Hermes commands:\n/status ha — latest Home Assistant states";
  }
  return `Unknown command "/${cmd}". Try /help`;
}

async function statusHa(ctx: CommandContext): Promise<string> {
  // Prefer a live HA query when configured; fall back to the DB timeline.
  if (ctx.ha.url && ctx.ha.token) {
    try {
      const res = await fetch(`${ctx.ha.url.replace(/\/$/, "")}/api/states`, {
        headers: { authorization: `Bearer ${ctx.ha.token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const states = (await res.json()) as { entity_id: string; state: string }[];
        const lines = states.slice(0, 10).map((s) => `• ${s.entity_id} → ${s.state}`);
        return `HA (live, ${states.length} entities):\n${lines.join("\n")}`;
      }
    } catch (err) {
      console.warn("[command] live HA query failed, using DB:", (err as Error).message);
    }
  }
  const recent = await ctx.db.recentStatuses(10);
  if (recent.length === 0) return "HA: no recent states recorded yet.";
  const lines = recent.map((r) => `• ${r.body}`);
  return `HA (last ${recent.length} recorded):\n${lines.join("\n")}`;
}
