import { Pool, type PoolClient } from "pg";
import type { Envelope } from "@hermes/shared";

/**
 * Web read layer. The web never writes events (the Processor is the only
 * writer); it reads the timeline and holds a dedicated LISTEN connection for the
 * SSE tail. Commands go out over the bus, not the DB.
 */

export interface EventRow extends Envelope {
  seq: number;
  ingest_ts: string;
}

let pool: Pool | null = null;
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL not set");
    pool = new Pool({ connectionString, max: 8 });
  }
  return pool;
}

const COLUMNS = `seq, id, ts, ingest_ts, source, kind, actor, channel, severity, body,
                 entities, correlation_id, tags, raw`;

function toRow(r: Record<string, unknown>): EventRow {
  return {
    seq: Number(r.seq),
    id: r.id as string,
    ts: new Date(r.ts as string).toISOString(),
    ingest_ts: new Date(r.ingest_ts as string).toISOString(),
    source: r.source as string,
    kind: r.kind as EventRow["kind"],
    actor: r.actor as EventRow["actor"],
    channel: r.channel as string,
    severity: r.severity as EventRow["severity"],
    body: r.body as string,
    entities: (r.entities as string[]) ?? [],
    correlation_id: (r.correlation_id as string | null) ?? null,
    tags: (r.tags as string[]) ?? [],
    raw: r.raw ?? {},
  };
}

/** Newest-first, for the server-rendered initial page. */
export async function recentEvents(limit = 100): Promise<EventRow[]> {
  const { rows } = await getPool().query(
    `SELECT ${COLUMNS} FROM events ORDER BY seq DESC LIMIT $1`,
    [limit],
  );
  return rows.map(toRow);
}

/** Ascending events strictly after a seq cursor — the resync replay (RULE 8). */
export async function eventsAfterSeq(cursor: number, limit = 1000): Promise<EventRow[]> {
  const { rows } = await getPool().query(
    `SELECT ${COLUMNS} FROM events WHERE seq > $1 ORDER BY seq ASC LIMIT $2`,
    [cursor, limit],
  );
  return rows.map(toRow);
}

export async function eventById(id: string): Promise<EventRow | null> {
  const { rows } = await getPool().query(`SELECT ${COLUMNS} FROM events WHERE id = $1`, [id]);
  return rows[0] ? toRow(rows[0]) : null;
}

export async function maxSeq(): Promise<number> {
  const { rows } = await getPool().query<{ m: string | null }>(`SELECT max(seq) m FROM events`);
  return rows[0]?.m ? Number(rows[0].m) : 0;
}

/** A dedicated client for LISTEN — caller MUST release it on disconnect. */
export async function listenClient(): Promise<PoolClient> {
  return getPool().connect();
}
