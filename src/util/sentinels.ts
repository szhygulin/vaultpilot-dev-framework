// Sentinel comment helpers for per-agent CLAUDE.md.
//
// Format written by `appendBlock` in src/agent/specialization.ts:
//   <!-- run:<runId> issue:#<N> outcome:<X> ts:<ISO> [tags:t1,t2] -->
//
// Pure functions only — file I/O lives in `specialization.ts`. Tested in
// `sentinels.test.ts` (node --test glob picks up `dist/src/util/*.test.js`).

const SENTINEL_RE =
  /^<!--\s+run:(\S+)\s+issue:#(\d+)\s+outcome:([\w-]+)\s+ts:(\S+?)(?:\s+tags:(\S+))?\s+-->$/;

export interface SentinelHeader {
  runId: string;
  issueId: number;
  outcome: string;
  ts: string;
  tags: string[];
}

export function parseSentinelHeader(line: string): SentinelHeader | null {
  const m = line.match(SENTINEL_RE);
  if (!m) return null;
  const tagsRaw = m[5];
  const tags =
    tagsRaw && tagsRaw.length > 0 ? tagsRaw.split(",").filter(Boolean) : [];
  return {
    runId: m[1],
    issueId: Number(m[2]),
    outcome: m[3],
    ts: m[4],
    tags,
  };
}

export function formatSentinelHeader(input: {
  runId: string;
  issueId: number;
  outcome: string;
  ts: string;
  tags?: string[];
}): string {
  const base = `<!-- run:${input.runId} issue:#${input.issueId} outcome:${input.outcome} ts:${input.ts}`;
  const tagsPart =
    input.tags && input.tags.length > 0
      ? ` tags:${[...input.tags].sort().join(",")}`
      : "";
  return `${base}${tagsPart} -->`;
}

interface SentinelLocation {
  header: SentinelHeader;
  /** 0-based line index of the sentinel comment line. */
  startLine: number;
  /**
   * 0-based line index where this block ends (exclusive) — equal to the
   * next sentinel's startLine, or `lines.length` for the last block.
   */
  endLine: number;
}

function locateSentinels(lines: string[]): SentinelLocation[] {
  const headers: { header: SentinelHeader; startLine: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const h = parseSentinelHeader(lines[i].trim());
    if (h) headers.push({ header: h, startLine: i });
  }
  const out: SentinelLocation[] = [];
  for (let i = 0; i < headers.length; i++) {
    const next = headers[i + 1];
    out.push({
      header: headers[i].header,
      startLine: headers[i].startLine,
      endLine: next ? next.startLine : lines.length,
    });
  }
  return out;
}

export interface ExpireDecision {
  /** Header indices to drop, in order. */
  drop: number[];
  /** Original sentinel headers (parallel to drop indices). */
  all: SentinelHeader[];
}

/**
 * Decide which `outcome:failure-lesson` blocks to drop. A block is dropped
 * when ≥ k subsequent `outcome:implement` blocks each share at least one
 * tag with the failure-lesson's tag-fingerprint.
 *
 * Conservative on missing tags: a failure-lesson with `tags: []` (legacy
 * sentinel from before tag embedding) never overlaps with any implement
 * sentinel and is therefore never expired. An `implement` block with
 * `tags: []` likewise contributes nothing to any expiry count. Better to
 * keep stale lessons than evict still-relevant ones.
 *
 * Out-of-order writes are not a concern: blocks accumulate by file
 * append, so file order matches chronological order — no need to re-sort
 * by `ts`.
 */
export function decideExpiry(
  headers: SentinelHeader[],
  k: number,
): ExpireDecision {
  const drop: number[] = [];
  if (k <= 0) return { drop, all: headers };
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (h.outcome !== "failure-lesson") continue;
    if (h.tags.length === 0) continue; // legacy / no fingerprint — keep
    const lessonTags = new Set(h.tags);
    let overlaps = 0;
    for (let j = i + 1; j < headers.length; j++) {
      const succ = headers[j];
      if (succ.outcome !== "implement") continue;
      if (succ.tags.length === 0) continue;
      const intersects = succ.tags.some((t) => lessonTags.has(t));
      if (intersects) overlaps += 1;
      if (overlaps >= k) break;
    }
    if (overlaps >= k) drop.push(i);
  }
  return { drop, all: headers };
}

export interface ExpireResult {
  content: string;
  droppedHeaders: SentinelHeader[];
}

/**
 * Walk the agent's CLAUDE.md content, drop expired failure-lesson blocks,
 * and return the rewritten content. Idempotent — re-applying on the
 * returned content with the same `k` drops nothing.
 */
export function expireFailureLessonsInContent(
  content: string,
  k: number,
): ExpireResult {
  const lines = content.split("\n");
  const located = locateSentinels(lines);
  if (located.length === 0) return { content, droppedHeaders: [] };

  const decision = decideExpiry(
    located.map((l) => l.header),
    k,
  );
  if (decision.drop.length === 0) return { content, droppedHeaders: [] };

  const dropSet = new Set(decision.drop);
  const dropped: SentinelHeader[] = [];
  for (const idx of decision.drop) dropped.push(located[idx].header);

  // Rebuild line-by-line. Prelude = everything before first sentinel.
  // For each kept sentinel, append its full block (header + body up to the
  // next sentinel boundary). For each dropped sentinel, also drop the
  // single blank line that precedes its header (appendBlock writes a
  // leading blank before every block); without this we'd accumulate a
  // stray blank line on each rewrite.
  const out: string[] = [];
  for (let i = 0; i < located[0].startLine; i++) out.push(lines[i]);

  for (let idx = 0; idx < located.length; idx++) {
    const loc = located[idx];
    if (dropSet.has(idx)) {
      // Trim a single trailing blank line off `out` so the dropped block's
      // leading blank doesn't survive the drop. Only collapse one — runs
      // of intentional blanks elsewhere in the file are preserved.
      if (out.length > 0 && out[out.length - 1] === "") out.pop();
      continue;
    }
    for (let i = loc.startLine; i < loc.endLine; i++) out.push(lines[i]);
  }

  return { content: out.join("\n"), droppedHeaders: dropped };
}

/**
 * Resolve `K` from env (`VP_DEV_FAILURE_LESSON_EXPIRE_K`) with a default
 * of 3. Non-positive / non-numeric env values fall back to the default
 * rather than disabling expiry silently — set the env to a large number
 * to effectively disable.
 */
export const DEFAULT_FAILURE_LESSON_EXPIRE_K = 3;

export function resolveExpireK(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.VP_DEV_FAILURE_LESSON_EXPIRE_K;
  if (raw == null || raw === "") return DEFAULT_FAILURE_LESSON_EXPIRE_K;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_FAILURE_LESSON_EXPIRE_K;
  return Math.floor(n);
}
