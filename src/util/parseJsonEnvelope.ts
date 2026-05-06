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
      // Salvage common LLM mistake: backslash-apostrophe (`\'`) is invalid
      // JSON but a frequent LLM output even when the system prompt forbids
      // it. Retry once with the apostrophe-escapes stripped. Only kicks in
      // on the first JSON.parse failure path; valid JSON skips this branch.
      const sanitized = stripBareApostropheEscapes(raw);
      if (sanitized !== raw) {
        try {
          parsed = JSON.parse(sanitized);
        } catch (err2) {
          lastJsonError = (err2 as Error).message;
          lastJsonRaw = raw;
          continue;
        }
        const salvaged = schema.safeParse(parsed);
        if (salvaged.success) {
          return { ok: true, value: salvaged.data, raw: sanitized };
        }
        lastSchemaError = salvaged.error.message;
        lastSchemaRaw = sanitized;
        continue;
      }
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

/**
 * Convert backslash-apostrophe (`\'`) sequences inside JSON string literals
 * into bare apostrophes. JSON's escape grammar (RFC 8259 §7) does NOT
 * recognize `\'`; only `\"`, `\\`, `\/`, `\b`, `\f`, `\n`, `\r`, `\t`,
 * `\uXXXX`. LLMs frequently emit `\'` anyway — adapting from JS/Python
 * habits — and the resulting payload is rejected by `JSON.parse` even
 * though the intent is clear.
 *
 * Only strips backslash-apostrophe pairs where the backslash is itself
 * unescaped (i.e., the count of consecutive backslashes immediately before
 * the apostrophe is odd → the last backslash is acting as an escape
 * introducer). `\\\'` (literal `\` + `\'`) keeps the apostrophe-escape
 * untouched since the preceding `\\` is the escape — but in practice the
 * outer JSON.parse would still reject this; the salvage is best-effort.
 *
 * Pure / synchronous so tests can exercise it without I/O.
 */
export function stripBareApostropheEscapes(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    // Count consecutive backslashes starting here.
    let run = 0;
    while (i + run < raw.length && raw[i + run] === "\\") run++;
    const next = raw[i + run];
    if (next === "'" && run % 2 === 1) {
      // Odd-count run: the last backslash is acting as an escape. Drop
      // just that one backslash, keep any preceding pairs as-is.
      out += "\\".repeat(run - 1);
      out += "'";
      i += run; // skip past the run AND the apostrophe
    } else {
      // Even-count run, or the next char isn't `'` — leave the run alone.
      out += "\\".repeat(run);
      i += run - 1; // -1 because the for-loop will increment
    }
  }
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
