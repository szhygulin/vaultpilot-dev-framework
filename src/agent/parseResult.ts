import { ResultEnvelopeSchema, type ResultEnvelope } from "../types.js";

export interface ParseOutcome {
  ok: boolean;
  envelope?: ResultEnvelope;
  error?: string;
  raw?: string;
}

const FENCED_RE = /```(?:json)?\s*\n?([\s\S]*?)\n?```/gi;

export function extractEnvelope(finalMessage: string): ParseOutcome {
  const candidates = collectCandidates(finalMessage);

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
    const result = ResultEnvelopeSchema.safeParse(parsed);
    if (result.success) {
      return { ok: true, envelope: result.data, raw };
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
