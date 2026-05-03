import type { ZodType } from "zod";

/**
 * Outcome of {@link parseJsonEnvelope}. On success `value` holds the
 * schema-validated payload and `raw` holds the JSON candidate string that
 * matched. On failure `error` carries the most-specific diagnostic
 * available (schema-validation > JSON-parse > no-envelope) and `raw` may
 * carry the offending candidate when one parsed but failed validation.
 */
export interface ParseEnvelopeOutcome<T> {
  ok: boolean;
  value?: T;
  raw?: string;
  error?: string;
}

const FENCED_RE = /```(?:json)?\s*\n?([\s\S]*?)\n?```/gi;

/**
 * Extract a JSON envelope from an LLM-generated message and validate it
 * against a Zod schema. Tries three candidate shapes:
 *
 *   1. Bare object — entire trimmed message is `{...}`.
 *   2. Fenced code blocks — every ` ```json ... ``` ` or ` ``` ... ``` `
 *      block in document order.
 *   3. Forward-scan brace-balanced last object (string-aware: tracks `"`
 *      quotes, handles `\"` escapes, only zeroes depth at top-level
 *      closures).
 *
 * Iterates candidates last-to-first and returns the first that BOTH
 * parses as JSON and validates against the schema. Schema-validation
 * errors are surfaced in preference to JSON-parse errors when at least
 * one candidate parsed but no candidate validated — so callers see the
 * most specific diagnostic rather than a misleading "no envelope found".
 *
 * Pass `z.unknown()` (or any always-passing schema) for sites that want
 * extraction without schema validation; they can run their own
 * `safeParse` on `value`.
 */
export function parseJsonEnvelope<T>(
  message: string,
  schema: ZodType<T>,
): ParseEnvelopeOutcome<T> {
  const candidates = collectCandidates(message);

  if (candidates.length === 0) {
    return { ok: false, error: "No JSON envelope found in final assistant message." };
  }

  let lastSchemaError: string | undefined;
  let lastSchemaRaw: string | undefined;
  let lastJsonError: string | undefined;
  let lastJsonRaw: string | undefined;

  for (let i = candidates.length - 1; i >= 0; i--) {
    const raw = candidates[i];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      lastJsonError = (err as Error).message;
      lastJsonRaw = raw;
      continue;
    }
    const result = schema.safeParse(parsed);
    if (result.success) {
      return { ok: true, value: result.data, raw };
    }
    lastSchemaError = result.error.message;
    lastSchemaRaw = raw;
  }

  if (lastSchemaError !== undefined) {
    return { ok: false, error: `Schema validation failed: ${lastSchemaError}`, raw: lastSchemaRaw };
  }
  return { ok: false, error: `JSON parse failed: ${lastJsonError}`, raw: lastJsonRaw };
}

function collectCandidates(message: string): string[] {
  const out: string[] = [];

  const trimmed = message.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    out.push(trimmed);
  }

  let m: RegExpExecArray | null;
  FENCED_RE.lastIndex = 0;
  while ((m = FENCED_RE.exec(message)) !== null) {
    const inner = m[1].trim();
    if (inner) out.push(inner);
  }

  const balanced = lastBalancedObject(message);
  if (balanced) out.push(balanced);

  return out;
}

function lastBalancedObject(message: string): string | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  let lastObject: string | null = null;
  for (let i = 0; i < message.length; i++) {
    const ch = message[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        lastObject = message.slice(start, i + 1);
        start = -1;
      } else if (depth < 0) {
        depth = 0;
        start = -1;
      }
    }
  }
  return lastObject;
}
