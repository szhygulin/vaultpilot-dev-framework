// Drop already-merged entries from `state/local-claude-md-pending.md`
// (issue #202, follow-up to PR #196).
//
// Phase 2 of the project-local CLAUDE.md promotion path. PR #196's queue
// path stages `@local-claude` candidates; the operator periodically opens a
// chore PR appending selected sections to project-local CLAUDE.md (or uses
// `--pr` for the auto-PR variant). After that PR merges, the queue still
// holds the entry — there's no closed-loop signal from "merged" back to
// the local queue. Operators end up scanning + manually deleting.
//
// This module gives them a tool: scan the queue, compare each entry's
// (heading + first-N-chars body) against every section in project-local
// CLAUDE.md via Jaccard, drop entries above threshold (`--merged`), or
// nuke the whole queue (`--all`).
//
// Why a fresh parser instead of `parseClaudeMdSections` (split.ts):
// `parseClaudeMdSections` only matches summarizer-emitted sections (those
// preceded by `<!-- run:... -->`). Project-local CLAUDE.md sections come
// in via PR (PR #196's localClaudePr.ts) with `<!-- promoted-from-summarizer -->`
// preambles, OR they're hand-authored project rules with no preamble at
// all. We need a permissive `## Heading` walker that catches both.
//
// Why heading + first-N-chars body Jaccard (not heading-only):
// Issue #202's spec calls out "heading-only Jaccard would miss reworded
// sections; full-body or first-N-chars Jaccard is more reliable." Headings
// get edited between queue-time and PR-merge-time (operator polish);
// bodies survive more reliably. Combining heading + body-prefix gives
// signal in both shapes without unbounded body length diluting the score.
//
// Why no token-gate (vs. `prune-lessons` / `compact-claude-md`):
// The queue file is gitignored local state. Dropping a false-positive
// entry is recoverable from the rendered CLAUDE.md (the matching content
// already lives there) and from Anthropic-side rate limits make
// re-running the producing agent cheap. The compact/prune flow protects
// proposal-vs-current-file drift across a 15-minute review window — that
// invariant doesn't apply here because the queue is append-only and the
// operator's review is in-process. Mirrors `cleanup incomplete-branches`
// (which also uses bare `--apply` + TTY prompt) rather than the
// proposal-hash dance.

import { promises as fs } from "node:fs";
import { LOCAL_CLAUDE_QUEUE_FILE } from "./localClaudeQueue.js";

/**
 * Default Jaccard threshold for the `--merged` mode. The issue defers
 * empirical tuning to "after the queue has been used in real-world
 * rotation," so we ship a conservative starting value: 0.55 trades a
 * false-positive rate for a low miss rate, given that the operator
 * reviews the advisory output before passing `--apply`.
 *
 * Override via `--threshold <n>` on the CLI or
 * `VP_DEV_QUEUE_CLEAR_JACCARD_MIN` in the environment.
 */
export const DEFAULT_QUEUE_CLEAR_JACCARD_MIN = 0.55;

/**
 * Body prefix length compared in similarity calculations. Long bodies
 * dilute the Jaccard signal; the first ~1KB carries the diagnostic
 * meat of a typical lesson section.
 */
export const BODY_PREFIX_FOR_MATCH = 1024;

export function resolveQueueClearJaccardMin(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.VP_DEV_QUEUE_CLEAR_JACCARD_MIN;
  if (raw == null || raw === "") return DEFAULT_QUEUE_CLEAR_JACCARD_MIN;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 1) {
    return DEFAULT_QUEUE_CLEAR_JACCARD_MIN;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Queue parsing.
//
// Entries from `appendToLocalClaudeQueue` are wrapped as:
//
//   <BLANK or NEWLINE>
//   <!-- queued source=... ts=... [utility=...] [gate=...] ... -->
//   ## Heading
//   body...
//   <BLANK>
//
// The header line is the boundary. `## Heading` may be missing for
// non-conforming entries — handle defensively: heading="" then.
// ---------------------------------------------------------------------------

export interface QueueEntry {
  /** The full provenance header line (e.g. `<!-- queued source=... -->`). */
  header: string;
  /** Heading text without the leading `## ` (empty if no heading line). */
  heading: string;
  /** Body content following the heading (or all content after header if no heading). */
  body: string;
  /** Raw block, header through the entry's last non-whitespace character. */
  raw: string;
  /** Byte offset of the header in the source content (for stable removal). */
  startOffset: number;
}

const QUEUE_HEADER_RE = /<!--\s*queued\b[^]*?-->/g;

export function parseQueueEntries(content: string): QueueEntry[] {
  const matches = [...content.matchAll(QUEUE_HEADER_RE)];
  const out: QueueEntry[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const startOffset = m.index ?? 0;
    const headerEnd = startOffset + m[0].length;
    const blockEnd =
      i + 1 < matches.length ? matches[i + 1].index ?? content.length : content.length;
    const after = content.slice(headerEnd, blockEnd);
    const headingMatch = after.match(/^\s*##\s+(.+)$/m);
    let heading = "";
    let body = "";
    if (headingMatch) {
      heading = headingMatch[1].trim();
      const headingIdxInAfter = after.indexOf(headingMatch[0]);
      body = after.slice(headingIdxInAfter + headingMatch[0].length).trim();
    } else {
      body = after.trim();
    }
    const raw = content.slice(startOffset, blockEnd).replace(/\s+$/, "");
    out.push({
      header: m[0],
      heading,
      body,
      raw,
      startOffset,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Project-local CLAUDE.md section parsing.
//
// Permissive walker — every `## Heading` line is a section boundary,
// regardless of any preceding provenance comment. Captures both
// hand-authored rules (no preamble) and PR-promoted lessons (preamble
// from `formatLessonAppend` in localClaudePr.ts).
// ---------------------------------------------------------------------------

export interface ProjectClaudeSection {
  heading: string;
  body: string;
}

const HEADING_RE = /^##\s+(.+)$/gm;

export function parseProjectClaudeSections(md: string): ProjectClaudeSection[] {
  const matches = [...md.matchAll(HEADING_RE)];
  const out: ProjectClaudeSection[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index ?? 0;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? md.length : md.length;
    const heading = m[1].trim();
    const headingLineEnd = start + m[0].length;
    const body = md.slice(headingLineEnd, end).trim();
    out.push({ heading, body });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tokenization + Jaccard.
//
// Stand-alone duplicate of the helpers in `state/lessonUtility.ts`. Those
// helpers are file-private (not exported) and tightly coupled to the
// stable-ID-driven dedup gate; copying the small amount of code here
// keeps the queue-clear path independent of the section-utility
// machinery and lets the threshold/prefix length evolve separately.
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
  "in", "into", "is", "it", "its", "of", "on", "or", "that", "the", "this",
  "to", "was", "were", "will", "with", "but", "if", "not", "no", "so",
]);

export function tokenize(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9-]+/)) {
    if (raw.length < 3) continue;
    if (STOP_WORDS.has(raw)) continue;
    out.add(raw);
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const t of a) if (b.has(t)) intersect++;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

export function similarityScore(
  entry: QueueEntry,
  section: ProjectClaudeSection,
): number {
  const entryTokens = tokenize(
    [entry.heading, entry.body.slice(0, BODY_PREFIX_FOR_MATCH)].join(" "),
  );
  const sectionTokens = tokenize(
    [section.heading, section.body.slice(0, BODY_PREFIX_FOR_MATCH)].join(" "),
  );
  return jaccard(entryTokens, sectionTokens);
}

// ---------------------------------------------------------------------------
// Detection (pure).
// ---------------------------------------------------------------------------

export interface QueueClearMatch {
  entry: QueueEntry;
  matchedSection: ProjectClaudeSection;
  similarity: number;
}

export interface DetectMergedQueueEntriesInput {
  queueContent: string;
  /** Project-local CLAUDE.md content (or empty string if no file). */
  claudeMd: string;
  /** Override; default = resolveQueueClearJaccardMin(). */
  jaccardMin?: number;
}

export interface DetectMergedQueueEntriesResult {
  entries: QueueEntry[];
  /** Subset of `entries` whose best-section similarity ≥ jaccardMin. */
  merged: QueueClearMatch[];
}

export function detectMergedQueueEntries(
  input: DetectMergedQueueEntriesInput,
): DetectMergedQueueEntriesResult {
  const min = input.jaccardMin ?? resolveQueueClearJaccardMin();
  const entries = parseQueueEntries(input.queueContent);
  const sections = parseProjectClaudeSections(input.claudeMd);
  const merged: QueueClearMatch[] = [];
  for (const entry of entries) {
    let best: { section: ProjectClaudeSection; sim: number } | null = null;
    for (const section of sections) {
      const sim = similarityScore(entry, section);
      if (!best || sim > best.sim) best = { section, sim };
    }
    if (best && best.sim >= min) {
      merged.push({ entry, matchedSection: best.section, similarity: best.sim });
    }
  }
  return { entries, merged };
}

// ---------------------------------------------------------------------------
// Mutation.
//
// `clearLocalClaudeQueue` is the destructive entry point. It rewrites the
// queue file via tmp-then-rename, mirroring `appendToLocalClaudeQueue`'s
// atomicity contract. Both `mode: "all"` (nuke) and `mode: "merged"`
// (filter by similarity) end with a fresh content blob and an atomic
// rename — no partial writes if the process dies mid-flight.
// ---------------------------------------------------------------------------

export interface ClearLocalClaudeQueueInput {
  mode: "all" | "merged";
  /** Override Jaccard threshold (only used in `merged` mode). */
  jaccardMin?: number;
  /** Override target queue file (testability). */
  queueFilePathOverride?: string;
  /** Override target CLAUDE.md path (testability). Default = `CLAUDE.md`. */
  claudeMdPathOverride?: string;
}

export interface ClearLocalClaudeQueueResult {
  filePath: string;
  totalBefore: number;
  remaining: number;
  removed: number;
  bytesBefore: number;
  bytesAfter: number;
  /** Empty when `mode === "all"`; populated for `merged` so callers can log. */
  matches: QueueClearMatch[];
}

export async function clearLocalClaudeQueue(
  input: ClearLocalClaudeQueueInput,
): Promise<ClearLocalClaudeQueueResult> {
  const filePath = input.queueFilePathOverride ?? LOCAL_CLAUDE_QUEUE_FILE;
  const claudeMdPath = input.claudeMdPathOverride ?? "CLAUDE.md";

  let queueContent = "";
  try {
    queueContent = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const entries = parseQueueEntries(queueContent);
  const totalBefore = entries.length;
  const bytesBefore = Buffer.byteLength(queueContent, "utf-8");

  let matches: QueueClearMatch[] = [];
  let kept: QueueEntry[];
  if (input.mode === "all") {
    kept = [];
  } else {
    let claudeMd = "";
    try {
      claudeMd = await fs.readFile(claudeMdPath, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    const detected = detectMergedQueueEntries({
      queueContent,
      claudeMd,
      jaccardMin: input.jaccardMin,
    });
    matches = detected.merged;
    const toRemove = new Set(detected.merged.map((m) => m.entry.startOffset));
    kept = entries.filter((e) => !toRemove.has(e.startOffset));
  }

  const nextContent = renderQueueContent(kept);
  await atomicWriteFile(filePath, nextContent);
  const bytesAfter = Buffer.byteLength(nextContent, "utf-8");

  return {
    filePath,
    totalBefore,
    remaining: kept.length,
    removed: totalBefore - kept.length,
    bytesBefore,
    bytesAfter,
    matches,
  };
}

function renderQueueContent(entries: QueueEntry[]): string {
  if (entries.length === 0) return "";
  return entries.map((e) => `\n${e.raw.trim()}\n`).join("");
}

async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  if (content === "") {
    // Truncate via overwrite (preserves the file so subsequent appends work).
    await fs.writeFile(filePath, "");
    return;
  }
  const tmp = `${filePath}.tmp.${process.pid}.${process.hrtime.bigint()}`;
  await fs.writeFile(tmp, content);
  await fs.rename(tmp, filePath);
}
