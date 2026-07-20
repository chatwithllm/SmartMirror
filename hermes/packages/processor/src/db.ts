import { Pool, type PoolClient } from "pg";
import { type Envelope, type Severity, SEVERITY_RANK, PG_NOTIFY_CHANNEL } from "@hermes/shared";
import {
  decideCorrelation,
  type CorrelationCandidate,
  type CorrelationInput,
} from "./correlate";

export interface PersistResult {
  inserted: boolean;
  correlationId: string | null;
  incident: "opened" | "attached" | null;
}

/**
 * The only Postgres writer in Hermes. Every persist runs the correlation
 * look-back, the event upsert, and any incident open/attach inside ONE
 * transaction (RULE 4), then fires pg_notify on commit for the web tail
 * (RULE 8). Ingest is idempotent on `envelope.id` (RULE 3).
 */
export class Db {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 8 });
  }

  async ping(): Promise<boolean> {
    try {
      await this.pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Enrich → correlate → persist an already-classified envelope. The envelope's
   * `entities` and `severity` must already be set by the pipeline; this method
   * assigns `correlation_id` and writes the incident.
   */
  async persist(e: Envelope, windowSec: number): Promise<PersistResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const candidates = await this.lookback(client, e, windowSec);
      const input: CorrelationInput = {
        id: e.id,
        ts: e.ts,
        entities: e.entities,
        severity: e.severity,
      };
      const decision = decideCorrelation(input, candidates);
      const correlationId = decision.kind === "none" ? null : decision.correlationId;

      const inserted = await this.insertEvent(client, e, correlationId);
      if (!inserted) {
        // Duplicate (QoS 1 replay). Nothing changed — roll back and report.
        await client.query("ROLLBACK");
        return { inserted: false, correlationId: null, incident: null };
      }

      let incident: PersistResult["incident"] = null;
      if (decision.kind === "open") {
        await client.query(
          `UPDATE events SET correlation_id = $1 WHERE id = $2 AND correlation_id IS NULL`,
          [decision.correlationId, decision.anchorId],
        );
        await client.query(
          `INSERT INTO incidents (id, opened_at, title, primary_entity, severity, status)
           VALUES ($1, $2, $3, $4, $5, 'open')
           ON CONFLICT (id) DO NOTHING`,
          [
            decision.correlationId,
            decision.openedAt,
            `Incident: ${decision.primaryEntity}`,
            decision.primaryEntity,
            decision.incidentSeverity,
          ],
        );
        incident = "opened";
      } else if (decision.kind === "attach") {
        await this.bumpIncidentSeverity(client, decision.correlationId, decision.incidentSeverity);
        incident = "attached";
      }

      await client.query(`SELECT pg_notify($1, $2)`, [PG_NOTIFY_CHANNEL, e.id]);
      await client.query("COMMIT");
      return { inserted: true, correlationId, incident };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Persist a command envelope AND its response in ONE transaction (RULE 4).
   * The whole exchange is keyed on the command id — a QoS 1 replay of the
   * command rolls back without re-sending the reply. The response inherits the
   * command's correlation cluster so the exchange renders as one thread.
   */
  async persistExchange(
    command: Envelope,
    response: Envelope,
    windowSec: number,
  ): Promise<{ inserted: boolean; correlationId: string | null }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const candidates = await this.lookback(client, command, windowSec);
      const decision = decideCorrelation(
        { id: command.id, ts: command.ts, entities: command.entities, severity: command.severity },
        candidates,
      );
      const correlationId = decision.kind === "none" ? null : decision.correlationId;

      const cmdInserted = await this.insertEvent(client, command, correlationId);
      if (!cmdInserted) {
        await client.query("ROLLBACK");
        return { inserted: false, correlationId: null };
      }

      if (decision.kind === "open") {
        await client.query(
          `UPDATE events SET correlation_id = $1 WHERE id = $2 AND correlation_id IS NULL`,
          [decision.correlationId, decision.anchorId],
        );
        await client.query(
          `INSERT INTO incidents (id, opened_at, title, primary_entity, severity, status)
           VALUES ($1, $2, $3, $4, $5, 'open')
           ON CONFLICT (id) DO NOTHING`,
          [
            decision.correlationId,
            decision.openedAt,
            `Incident: ${decision.primaryEntity}`,
            decision.primaryEntity,
            decision.incidentSeverity,
          ],
        );
      } else if (decision.kind === "attach") {
        await this.bumpIncidentSeverity(client, decision.correlationId, decision.incidentSeverity);
      }

      // The response joins the command's cluster (or stands with it, null).
      await this.insertEvent(client, response, correlationId);

      await client.query(`SELECT pg_notify($1, $2)`, [PG_NOTIFY_CHANNEL, command.id]);
      await client.query(`SELECT pg_notify($1, $2)`, [PG_NOTIFY_CHANNEL, response.id]);
      await client.query("COMMIT");
      return { inserted: true, correlationId };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  private async lookback(
    client: PoolClient,
    e: Envelope,
    windowSec: number,
  ): Promise<CorrelationCandidate[]> {
    if (e.entities.length === 0) return [];
    const windowStart = new Date(new Date(e.ts).getTime() - windowSec * 1000).toISOString();
    const { rows } = await client.query<{
      id: string;
      ts: string;
      entities: string[];
      correlation_id: string | null;
      severity: Severity;
    }>(
      `SELECT id, ts, entities, correlation_id, severity
         FROM events
        WHERE ts >= $1 AND ts <= $2 AND entities ?| $3::text[]
        ORDER BY ts ASC`,
      [windowStart, e.ts, e.entities],
    );
    return rows.map((r) => ({
      id: r.id,
      ts: new Date(r.ts).toISOString(),
      entities: r.entities,
      correlation_id: r.correlation_id,
      severity: r.severity,
    }));
  }

  private async insertEvent(
    client: PoolClient,
    e: Envelope,
    correlationId: string | null,
  ): Promise<boolean> {
    const { rowCount } = await client.query(
      `INSERT INTO events
         (id, ts, source, kind, actor, channel, severity, body, entities, correlation_id, tags, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [
        e.id,
        e.ts,
        e.source,
        e.kind,
        e.actor,
        e.channel,
        e.severity,
        e.body,
        JSON.stringify(e.entities),
        correlationId,
        JSON.stringify(e.tags),
        JSON.stringify(e.raw ?? {}),
      ],
    );
    return (rowCount ?? 0) > 0;
  }

  private async bumpIncidentSeverity(
    client: PoolClient,
    incidentId: string,
    candidate: Severity,
  ): Promise<void> {
    const { rows } = await client.query<{ severity: Severity }>(
      `SELECT severity FROM incidents WHERE id = $1`,
      [incidentId],
    );
    const current = rows[0]?.severity;
    if (!current || SEVERITY_RANK[candidate] > SEVERITY_RANK[current]) {
      await client.query(`UPDATE incidents SET severity = $2 WHERE id = $1`, [incidentId, candidate]);
    }
  }

  /** Read helper for the `/status ha` command: latest state per entity. */
  async recentStatuses(limit = 10): Promise<{ body: string; ts: string; severity: Severity }[]> {
    const { rows } = await this.pool.query<{ body: string; ts: string; severity: Severity }>(
      `SELECT body, ts, severity FROM events
        WHERE source = 'ha'
        ORDER BY ts DESC
        LIMIT $1`,
      [limit],
    );
    return rows;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
