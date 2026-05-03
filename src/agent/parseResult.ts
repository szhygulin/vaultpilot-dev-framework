import { parseJsonEnvelope } from "../util/parseJsonEnvelope.js";
import { ResultEnvelopeSchema, type ResultEnvelope } from "../types.js";

export interface ParseOutcome {
  ok: boolean;
  envelope?: ResultEnvelope;
  error?: string;
  raw?: string;
}

/**
 * Extract and validate the `ResultEnvelope` JSON payload from a coding
 * agent's final assistant message. Thin wrapper over the shared
 * {@link parseJsonEnvelope} extractor — kept so call sites that read
 * `.envelope` (rather than `.value`) don't churn.
 */
export function extractEnvelope(finalMessage: string): ParseOutcome {
  const r = parseJsonEnvelope(finalMessage, ResultEnvelopeSchema);
  return { ok: r.ok, envelope: r.value, error: r.error, raw: r.raw };
}
