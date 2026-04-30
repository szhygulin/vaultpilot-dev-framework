import { ResultEnvelopeSchema, type ResultEnvelope } from "../types.js";

export interface ParseOutcome {
  ok: boolean;
  envelope?: ResultEnvelope;
  error?: string;
  raw?: string;
}

const FENCED_JSON_RE = /```json\s*\n([\s\S]*?)\n```/gi;

export function extractEnvelope(finalMessage: string): ParseOutcome {
  const candidates = collectFencedBlocks(finalMessage);

  if (candidates.length === 0) {
    const inlineCandidate = trySpliceObject(finalMessage);
    if (inlineCandidate) candidates.push(inlineCandidate);
  }

  if (candidates.length === 0) {
    return { ok: false, error: "No fenced ```json``` block found in final assistant message." };
  }

  const raw = candidates[candidates.length - 1];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: `JSON parse failed: ${(err as Error).message}`, raw };
  }
  const result = ResultEnvelopeSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: `Schema validation failed: ${result.error.message}`, raw };
  }
  return { ok: true, envelope: result.data, raw };
}

function collectFencedBlocks(message: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  FENCED_JSON_RE.lastIndex = 0;
  while ((m = FENCED_JSON_RE.exec(message)) !== null) {
    out.push(m[1].trim());
  }
  return out;
}

function trySpliceObject(message: string): string | null {
  const start = message.lastIndexOf("{");
  const end = message.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return null;
  const candidate = message.slice(start, end + 1);
  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    return null;
  }
}
