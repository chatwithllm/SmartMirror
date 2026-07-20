import { randomUUID } from "node:crypto";
import {
  type Envelope,
  extractEntities,
  makeEnvelope,
  severityAtLeast,
  type Severity,
} from "@hermes/shared";
import { classifySeverity } from "./classify";
import { Db } from "./db";
import { ProcessorBus } from "./bus";
import { executeCommand, type CommandContext } from "./commands";

/**
 * The Processor pipeline (DESIGN §5). Per envelope:
 *   validate (done at bus) → dedupe (upsert on id) → extract entities →
 *   classify severity → correlate → persist (one txn) → notify + retained
 *   status → route to egress if severity >= threshold or it's a command reply.
 */
export class Pipeline {
  constructor(
    private readonly db: Db,
    private readonly bus: ProcessorBus,
    private readonly opts: { windowSec: number; routeThreshold: Severity; ha: CommandContext["ha"] },
  ) {}

  async handle(raw: Envelope): Promise<void> {
    // Enrich: extraction runs over body + raw; classification raises severity.
    const entities = raw.entities.length ? raw.entities : extractEntities(raw.body, raw.raw);
    const enriched = makeEnvelope({
      ...raw,
      entities,
      severity: classifySeverity({ ...raw, entities }),
    });

    if (enriched.kind === "command") {
      await this.handleCommand(enriched);
      return;
    }

    const result = await this.db.persist(enriched, this.opts.windowSec);
    if (!result.inserted) return; // duplicate replay — already processed

    this.publishStatus(enriched);
    if (severityAtLeast(enriched.severity, this.opts.routeThreshold)) {
      this.bus.publishEgress(enriched.channel, enriched);
    }
  }

  private async handleCommand(command: Envelope): Promise<void> {
    const ctx: CommandContext = { db: this.db, ha: this.opts.ha };
    const replyBody = await executeCommand(command, ctx);

    const response = makeEnvelope({
      id: randomUUID(),
      ts: new Date().toISOString(),
      source: "hermes",
      kind: "message",
      actor: "agent",
      channel: command.channel,
      severity: "info",
      body: replyBody,
      entities: command.entities,
      tags: command.tags,
      raw: { in_reply_to: command.id, ...(command.raw as object) },
    });

    const result = await this.db.persistExchange(command, response, this.opts.windowSec);
    if (!result.inserted) return; // command replay — reply already sent

    this.publishStatus(command);
    // A command reply always routes back out to the originating channel.
    if (command.channel !== "-") this.bus.publishEgress(command.channel, response);
  }

  private publishStatus(e: Envelope): void {
    this.bus.publishStatus(e.source, e);
  }
}
