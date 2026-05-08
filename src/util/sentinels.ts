// Sentinel comment helpers for per-agent CLAUDE.md.
//
// Format written by `appendBlock` in src/agent/specialization.ts:
//   <!-- run:<runId> issue:#<N> outcome:<X> ts:<ISO> -->
//
// Tags used to be embedded in this header (`tags:t1,t2`); they now live in
// the per-agent `agents/<id>/section-tags.json` sidecar so that ~150 bytes
// of operator-only metadata per section don't load into the agent's prompt
// context. The parser still tolerates legacy `tags:` so un-migrated
// CLAUDE.mds continue to parse, but the header type doesn't expose them —
// callers that need the tag set go through `src/state/sectionTags.ts`.
//
// `issue:#(\d+(?:\+#\d+)*)` so `outcome:compacted` blocks (issue #162) —
// which embed multiple source IDs as `issue:#100+#101+#102` — are still
// located by the expiry walker. Without this, locateSentinels skips the
// compacted line, the previous block silently absorbs the compacted
// block's bytes as part of its body, and dropping the previous block on
// expiry takes the compacted block out as collateral damage.
//
// Pure functions only — file I/O lives in `specialization.ts`. Tested in
// `sentinels.test.ts` (node --test glob picks up `dist/src/util/*.test.js`).
const SENTINEL_RE =
  /^<!--\s+run:(\S+)\s+issue:#(\d+(?:\+#\d+)*)\s+outcome:([\w-]+)\s+ts:(\S+?)(?:\s+tags:(\S+))?\s+-->$/;

export interface SentinelHeader {
  runId: string;
  /** Canonical / first issue ID. For non-compacted blocks, the only ID. */
  issueId: number;
  /** All source issue IDs for `outcome:compacted` blocks (issue #162).
   * Undefined for single-issue blocks. */
  issueIds?: number[];
  outcome: string;
  ts: string;
}

export function parseSentinelHeader(line: string): SentinelHeader | null {
  const m = line.match(SENTINEL_RE);
  if (!m) return null;
  const issueIds = m[2].split("+").map((tok) => Number(tok.replace(/^#/, "")));
  const header: SentinelHeader = {
    runId: m[1],
    issueId: issueIds[0],
    outcome: m[3],
    ts: m[4],
  };
  // Only set when the sentinel encodes multiple IDs — keeps the
  // single-ID shape deep-equal-comparable to the pre-#162 record shape.
  if (issueIds.length > 1) header.issueIds = issueIds;
  return header;
}

/**
 * Extract legacy `tags:t1,t2` from a sentinel line, if present. Used by the
 * one-shot migration to populate `section-tags.json` from un-migrated
 * CLAUDE.mds. Returns [] for lines that don't match the sentinel shape or
 * have no legacy tags.
 */
export function extractLegacySentinelTags(line: string): string[] {
  const m = line.match(SENTINEL_RE);
  if (!m) return [];
  const raw = m[5];
  if (!raw) return [];
  return raw.split(",").filter(Boolean);
}

export function formatSentinelHeader(input: {
  runId: string;
  issueId: number;
  outcome: string;
  ts: string;
}): string {
  return `<!-- run:${input.runId} issue:#${input.issueId} outcome:${input.outcome} ts:${input.ts} -->`;
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
 * Per-kind expiry policy. A sentinel of kind `kind` is dropped when at
 * least `k` newer sentinels (whose outcome ∈ `supersededBy`) satisfy the
 * `overlap` predicate against the candidate's tag-fingerprint.
 *
 * `k <= 0` or `k = Infinity` disables expiry for this kind. The
 * `supersededBy` list lets a kind be superseded by either itself
 * (success-lessons → success-lessons) or by a different kind
 * (failure-lessons → implements).
 */
export interface ExpiryPolicy {
  kind: string;
  k: number;
  supersededBy: string[];
  overlap:
    | { mode: "any-shared-tag" }
    | { mode: "jaccard"; minScore: number };
}

function tagsOverlap(
  candidateTags: Set<string>,
  successorTags: string[],
  rule: ExpiryPolicy["overlap"],
): boolean {
  if (candidateTags.size === 0 || successorTags.length === 0) return false;
  if (rule.mode === "any-shared-tag") {
    return successorTags.some((t) => candidateTags.has(t));
  }
  // Jaccard: |A ∩ B| / |A ∪ B|
  const succSet = new Set(successorTags);
  let intersect = 0;
  for (const t of candidateTags) if (succSet.has(t)) intersect++;
  const union = candidateTags.size + succSet.size - intersect;
  if (union === 0) return false;
  return intersect / union >= rule.minScore;
}

/**
 * Generalized supersession-based expiry. For each header, look up its
 * policy by `outcome`; if ≥ `policy.k` newer headers of a kind in
 * `policy.supersededBy` satisfy the policy's tag-overlap rule, drop the
 * candidate.
 *
 * Tags are passed alongside via `tagsByIndex` (parallel to `headers`) — the
 * caller resolves them from the sidecar (`src/state/sectionTags.ts`).
 * Conservative on missing tags: a candidate with empty tags is never
 * dropped, and successors with empty tags never count toward supersession.
 * Idempotent: re-applying on already-pruned content drops nothing.
 *
 * Out-of-order writes are not a concern — blocks accumulate by file
 * append, so file order matches chronological order.
 */
export function decideExpiryWithPolicies(
  headers: SentinelHeader[],
  tagsByIndex: string[][],
  policies: ExpiryPolicy[],
): ExpireDecision {
  const drop: number[] = [];
  const policyByKind = new Map<string, ExpiryPolicy>();
  for (const p of policies) policyByKind.set(p.kind, p);

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const policy = policyByKind.get(h.outcome);
    if (!policy) continue;
    if (!Number.isFinite(policy.k) || policy.k <= 0) continue;
    const candidateTagList = tagsByIndex[i] ?? [];
    if (candidateTagList.length === 0) continue;

    const candidateTags = new Set(candidateTagList);
    const allowedSuccessors = new Set(policy.supersededBy);
    let overlaps = 0;
    for (let j = i + 1; j < headers.length; j++) {
      const succ = headers[j];
      if (!allowedSuccessors.has(succ.outcome)) continue;
      const succTags = tagsByIndex[j] ?? [];
      if (succTags.length === 0) continue;
      if (tagsOverlap(candidateTags, succTags, policy.overlap)) overlaps += 1;
      if (overlaps >= policy.k) break;
    }
    if (overlaps >= policy.k) drop.push(i);
  }
  return { drop, all: headers };
}

/**
 * Backward-compatible wrapper: decide which `outcome:failure-lesson`
 * blocks to drop using the legacy single-K rule (any-shared-tag overlap
 * against `outcome:implement` successors). Equivalent to
 * `decideExpiryWithPolicies(headers, tagsByIndex, [failure-lesson policy])`.
 */
export function decideExpiry(
  headers: SentinelHeader[],
  tagsByIndex: string[][],
  k: number,
): ExpireDecision {
  return decideExpiryWithPolicies(headers, tagsByIndex, [
    {
      kind: "failure-lesson",
      k,
      supersededBy: ["implement"],
      overlap: { mode: "any-shared-tag" },
    },
  ]);
}

export interface ExpireResult {
  content: string;
  droppedHeaders: SentinelHeader[];
}

/**
 * Walk content, drop expired sentinel blocks per the supplied policies,
 * return the rewritten content. Idempotent — re-applying on already-pruned
 * content with the same policies drops nothing.
 *
 * `getTags(header)` resolves each header's tag list from the caller-owned
 * sidecar; sentinels.ts stays storage-agnostic.
 */
export function expireSentinelsInContent(
  content: string,
  policies: ExpiryPolicy[],
  getTags: (header: SentinelHeader) => string[],
): ExpireResult {
  const lines = content.split("\n");
  const located = locateSentinels(lines);
  if (located.length === 0) return { content, droppedHeaders: [] };

  const headers = located.map((l) => l.header);
  const tagsByIndex = headers.map((h) => getTags(h));
  const decision = decideExpiryWithPolicies(headers, tagsByIndex, policies);
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
 * Drop sentinel blocks whose stable IDs match `stableIdsToDrop`. Stable IDs
 * are computed via the supplied `deriveId` callback so this module doesn't
 * need to import the lessonUtility hashing logic. Used by the prune-lessons
 * CLI (#179 Phase 1, option C) to remove specifically-listed sections.
 *
 * Idempotent — re-applying with the same drop set on already-pruned content
 * is a no-op.
 */
export function dropSentinelsByStableId(
  content: string,
  stableIdsToDrop: ReadonlySet<string>,
  deriveId: (header: SentinelHeader) => string,
): ExpireResult {
  if (stableIdsToDrop.size === 0) return { content, droppedHeaders: [] };
  const lines = content.split("\n");
  const located = locateSentinels(lines);
  if (located.length === 0) return { content, droppedHeaders: [] };

  const dropIndices: number[] = [];
  const dropped: SentinelHeader[] = [];
  for (let i = 0; i < located.length; i++) {
    const id = deriveId(located[i].header);
    if (stableIdsToDrop.has(id)) {
      dropIndices.push(i);
      dropped.push(located[i].header);
    }
  }
  if (dropIndices.length === 0) return { content, droppedHeaders: [] };

  const dropSet = new Set(dropIndices);
  const out: string[] = [];
  for (let i = 0; i < located[0].startLine; i++) out.push(lines[i]);
  for (let idx = 0; idx < located.length; idx++) {
    const loc = located[idx];
    if (dropSet.has(idx)) {
      // Trim a single trailing blank line so the dropped block's leading
      // blank doesn't survive the drop. Mirrors expireSentinelsInContent.
      if (out.length > 0 && out[out.length - 1] === "") out.pop();
      continue;
    }
    for (let i = loc.startLine; i < loc.endLine; i++) out.push(lines[i]);
  }
  return { content: out.join("\n"), droppedHeaders: dropped };
}

/**
 * Backward-compatible wrapper: drop expired `failure-lesson` blocks using
 * the legacy single-K rule. Delegates to `expireSentinelsInContent` with
 * the failure-lesson policy only.
 */
export function expireFailureLessonsInContent(
  content: string,
  k: number,
  getTags: (header: SentinelHeader) => string[],
): ExpireResult {
  return expireSentinelsInContent(
    content,
    [
      {
        kind: "failure-lesson",
        k,
        supersededBy: ["implement"],
        overlap: { mode: "any-shared-tag" },
      },
    ],
    getTags,
  );
}

/**
 * Defaults for per-kind expiry. Failure-lessons stay at K=3 (cheap signal
 * superseded by even one overlapping success). Success-lessons need a
 * higher K=5 because they're individually weaker signals — and use Jaccard
 * ≥ 0.5 so a barely-overlapping later success doesn't supersede a
 * topically-distinct earlier one. Pushback lessons are preserved
 * indefinitely (Infinity) — they capture push-back-worthy patterns and
 * aren't superseded by a single newer pushback.
 */
export const DEFAULT_FAILURE_LESSON_EXPIRE_K = 3;
export const DEFAULT_SUCCESS_LESSON_EXPIRE_K = 5;
export const DEFAULT_PUSHBACK_LESSON_EXPIRE_K = Number.POSITIVE_INFINITY;

function parseEnvFiniteK(
  raw: string | undefined,
  fallback: number,
): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function parseEnvKAllowInfinity(
  raw: string | undefined,
  fallback: number,
): number {
  if (raw == null || raw === "") return fallback;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "infinity" || trimmed === "off" || trimmed === "disabled") {
    return Number.POSITIVE_INFINITY;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

/**
 * Resolve `K` for the failure-lesson policy from env
 * (`VP_DEV_FAILURE_LESSON_EXPIRE_K`) with a default of 3. Non-positive /
 * non-numeric env values fall back to the default rather than disabling
 * expiry silently — set the env to a large number to effectively disable.
 *
 * Kept for backward compatibility; new callers should prefer
 * `resolveExpiryPolicies()` which covers all sentinel kinds.
 */
export function resolveExpireK(env: NodeJS.ProcessEnv = process.env): number {
  return parseEnvFiniteK(
    env.VP_DEV_FAILURE_LESSON_EXPIRE_K,
    DEFAULT_FAILURE_LESSON_EXPIRE_K,
  );
}

/**
 * Resolve the full set of per-kind expiry policies from environment
 * variables, with sane defaults. Knobs:
 *   - VP_DEV_FAILURE_LESSON_EXPIRE_K (default 3)
 *   - VP_DEV_SUCCESS_LESSON_EXPIRE_K (default 5)
 *   - VP_DEV_PUSHBACK_LESSON_EXPIRE_K (default Infinity / disabled;
 *     accepts a positive integer to enable, or "off"/"disabled"/
 *     "infinity" to disable explicitly)
 */
export function resolveExpiryPolicies(
  env: NodeJS.ProcessEnv = process.env,
): ExpiryPolicy[] {
  return [
    {
      kind: "failure-lesson",
      k: parseEnvFiniteK(
        env.VP_DEV_FAILURE_LESSON_EXPIRE_K,
        DEFAULT_FAILURE_LESSON_EXPIRE_K,
      ),
      supersededBy: ["implement"],
      overlap: { mode: "any-shared-tag" },
    },
    {
      kind: "implement",
      k: parseEnvFiniteK(
        env.VP_DEV_SUCCESS_LESSON_EXPIRE_K,
        DEFAULT_SUCCESS_LESSON_EXPIRE_K,
      ),
      supersededBy: ["implement"],
      overlap: { mode: "jaccard", minScore: 0.5 },
    },
    {
      kind: "pushback",
      k: parseEnvKAllowInfinity(
        env.VP_DEV_PUSHBACK_LESSON_EXPIRE_K,
        DEFAULT_PUSHBACK_LESSON_EXPIRE_K,
      ),
      supersededBy: ["pushback"],
      overlap: { mode: "any-shared-tag" },
    },
  ];
}
