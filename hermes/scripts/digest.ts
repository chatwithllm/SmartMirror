/**
 * Overnight digest / replay (PLAN P4.2). Reconstructs a written brief of what
 * happened over a time range from the event log.
 *
 *   tsx scripts/digest.ts                       # last 24h
 *   tsx scripts/digest.ts --hours 12
 *   tsx scripts/digest.ts --from 2026-07-19T20:00:00Z --to 2026-07-20T08:00:00Z
 */
import { Client } from "pg";
import { buildDigest } from "../packages/processor/src/digest";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const now = new Date();
  const hours = Number(arg("hours") ?? 24);
  const to = arg("to") ?? now.toISOString();
  const from = arg("from") ?? new Date(new Date(to).getTime() - hours * 3600_000).toISOString();

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const events = await client.query(
      `SELECT ts, source, kind, actor, severity, body, entities, correlation_id
         FROM events WHERE ts >= $1 AND ts <= $2 ORDER BY ts`,
      [from, to],
    );
    const incidents = await client.query(
      `SELECT id, opened_at, primary_entity, severity, status FROM incidents`,
    );
    const brief = buildDigest(
      events.rows.map((r) => ({ ...r, ts: new Date(r.ts).toISOString() })),
      incidents.rows.map((r) => ({ ...r, opened_at: new Date(r.opened_at).toISOString() })),
      { from, to },
    );
    console.log(brief);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
