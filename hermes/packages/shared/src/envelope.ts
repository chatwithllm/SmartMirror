import { z } from "zod";

/**
 * The canonical Hermes envelope — the ONLY inter-job contract.
 *
 * Every boundary (bus publish, bus consume, DB write) validates against this
 * schema. A message that fails validation goes to the dead-letter topic; it is
 * never silently dropped. No job may read or write a field not defined here.
 */

export const KIND = ["status", "message", "alert", "command", "note"] as const;
export const ACTOR = ["system", "nik", "agent"] as const;
export const SEVERITY = ["info", "warn", "error", "crit"] as const;

export const KindSchema = z.enum(KIND);
export const ActorSchema = z.enum(ACTOR);
export const SeveritySchema = z.enum(SEVERITY);

export type Kind = (typeof KIND)[number];
export type Actor = (typeof ACTOR)[number];
export type Severity = (typeof SEVERITY)[number];

/** Ordered severity ladder for threshold comparisons (info < warn < error < crit). */
export const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  warn: 1,
  error: 2,
  crit: 3,
};

export function severityAtLeast(value: Severity, threshold: Severity): boolean {
  return SEVERITY_RANK[value] >= SEVERITY_RANK[threshold];
}

/**
 * Envelope schema. Mirrors DESIGN.md §2 key-for-key — no nicer nesting.
 * `ts` is event time (ISO-8601 UTC). `correlation_id` is null until the
 * Processor assigns it.
 */
export const EnvelopeSchema = z
  .object({
    id: z.string().uuid(),
    ts: z.string().datetime({ offset: true }),
    source: z.string().min(1),
    kind: KindSchema,
    actor: ActorSchema,
    channel: z.string().min(1).default("-"),
    severity: SeveritySchema.default("info"),
    body: z.string(),
    entities: z.array(z.string()).default([]),
    correlation_id: z.string().uuid().nullable().default(null),
    tags: z.array(z.string()).default([]),
    raw: z.unknown().default({}),
  })
  .strict();

export type Envelope = z.infer<typeof EnvelopeSchema>;
/** Shape accepted at producer boundaries before defaults are applied. */
export type EnvelopeInput = z.input<typeof EnvelopeSchema>;

export type ValidationOk = { ok: true; envelope: Envelope };
export type ValidationErr = { ok: false; reason: string; issues: z.ZodIssue[] };
export type ValidationResult = ValidationOk | ValidationErr;

/**
 * Validate an unknown payload against the envelope schema. Callers that get
 * `ok: false` MUST route the payload (plus `reason`) to the dead-letter topic —
 * never drop it silently (RULE 2).
 */
export function validateEnvelope(input: unknown): ValidationResult {
  const parsed = EnvelopeSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, envelope: parsed.data };
  }
  const reason = parsed.error.issues
    .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
    .join("; ");
  return { ok: false, reason, issues: parsed.error.issues };
}

/**
 * Convenience for producers: fill defaults + validate. Throws on invalid input
 * (a producer building its own envelope is a programming error, not a
 * dead-letter case).
 */
export function makeEnvelope(input: EnvelopeInput): Envelope {
  return EnvelopeSchema.parse(input);
}

/** The dead-letter payload wraps the offending message with a reason. */
export const DeadLetterSchema = z
  .object({
    reason: z.string(),
    at: z.string().datetime({ offset: true }),
    topic: z.string().optional(),
    payload: z.unknown(),
  })
  .strict();

export type DeadLetter = z.infer<typeof DeadLetterSchema>;
