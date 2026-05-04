import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureDir, withFileLock } from "../state/locks.js";
import { AGENTS_ROOT, agentClaudeMdPath } from "./specialization.js";

/**
 * Cross-agent shared lessons pool. Read at runtime by every coding agent in
 * the matching domain; written ONLY by the orchestrator's `vp-dev lessons
 * review` curation flow. The boundary preserved by this split is the same
 * one CLAUDE.md's "cross-agent writes corrupt parallel runs" rule names —
 * agents never reach into `agents/.shared/` during a run.
 */

export const LESSONS_DIR = path.join(AGENTS_ROOT, ".shared", "lessons");

/**
 * Pool-file size cap. Keeps prompt seeding bounded — every fresh agent in
 * the matching domain reads the entire pool file, so unbounded growth would
 * inflate every dispatch.
 */
export const POOL_LINE_CAP = 200;

/**
 * Per-entry length cap. Defense in depth around the prompt-injection-via-
 * promotion residual risk: a borderline candidate that slips past human
 * review can't smuggle a multi-page rule into every sibling's seed.
 */
export const ENTRY_LINE_CAP = 30;

const POOL_HEADER = `# Shared lessons pool

Read-only at agent runtime. Curated by \`vp-dev lessons review\` — never
edited by a coding agent during a run. The orchestrator process is the only
writer for this directory.

## Format constraints
- Each entry: at most ${ENTRY_LINE_CAP} lines (including provenance comment + heading).
- Descriptive observations only — no imperative instructions to siblings.
- Quote or fence technical content (commands, addresses, code).
- File capped at ${POOL_LINE_CAP} lines. When full, trim manually before
  promoting more.

`;

export interface PoolEntry {
  domain: string;
  heading: string;
  body: string;
  sourceAgentId: string;
  ts: string;
}

export function poolPath(domain: string): string {
  return path.join(LESSONS_DIR, `${normalizeDomain(domain)}.md`);
}

export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

export async function readDomainPool(domain: string): Promise<string | null> {
  const norm = normalizeDomain(domain);
  if (!norm) return null;
  try {
    return await fs.readFile(poolPath(norm), "utf-8");
  } catch {
    return null;
  }
}

export function formatEntry(entry: PoolEntry): string {
  return [
    "",
    `<!-- promoted from:${entry.sourceAgentId} ts:${entry.ts} -->`,
    `## ${entry.heading.trim()}`,
    "",
    entry.body.trim(),
    "",
  ].join("\n");
}

export function countLines(s: string): number {
  if (s.length === 0) return 0;
  // Trailing newline contributes a final empty "line" via split — match the
  // user's mental model (`wc -l`) by trimming one trailing newline before
  // counting.
  const stripped = s.endsWith("\n") ? s.slice(0, -1) : s;
  if (stripped.length === 0) return 0;
  return stripped.split(/\r?\n/).length;
}

export type AppendResult =
  | { kind: "appended"; totalLines: number; entryLines: number }
  | { kind: "rejected-pool-cap"; currentLines: number; entryLines: number; cap: number }
  | { kind: "rejected-entry-cap"; entryLines: number; cap: number };

export async function appendDomainPool(entry: PoolEntry): Promise<AppendResult> {
  const filePath = poolPath(entry.domain);
  const formatted = formatEntry(entry);
  const entryLines = countLines(formatted);
  if (entryLines > ENTRY_LINE_CAP) {
    return { kind: "rejected-entry-cap", entryLines, cap: ENTRY_LINE_CAP };
  }
  await ensureDir(path.dirname(filePath));
  return withFileLock(filePath, async () => {
    let current: string;
    try {
      current = await fs.readFile(filePath, "utf-8");
    } catch {
      current = POOL_HEADER;
    }
    const currentLines = countLines(current);
    if (currentLines + entryLines > POOL_LINE_CAP) {
      return {
        kind: "rejected-pool-cap",
        currentLines,
        entryLines,
        cap: POOL_LINE_CAP,
      };
    }
    const next = current.endsWith("\n") ? current + formatted : current + "\n" + formatted;
    const tmp = `${filePath}.tmp.${process.pid}`;
    await fs.writeFile(tmp, next);
    await fs.rename(tmp, filePath);
    return { kind: "appended", totalLines: countLines(next), entryLines };
  });
}

/**
 * Promotion-candidate marker scanner. The summarizer prompt instructs the
 * LLM to wrap cross-agent-useful body content in
 * `<!-- promote-candidate:<domain> -->...<!-- /promote-candidate -->`. This
 * regex extracts each candidate block from a CLAUDE.md, leaving every other
 * <!-- ... --> comment (provenance, promoted, not-promoted) untouched.
 */
const CANDIDATE_RE =
  /<!--\s*promote-candidate:([a-z0-9-]+)\s*-->([\s\S]*?)<!--\s*\/promote-candidate\s*-->/gi;

/** Match a markdown ATX h2 heading line. */
const H2_RE = /^##\s+(.+?)\s*$/m;

export interface PendingCandidate {
  agentId: string;
  domain: string;
  /** The text between the open + close markers, trimmed. */
  inner: string;
  /** The nearest preceding `## ...` heading, used as the pool entry heading. */
  heading: string;
  /** Index in the source CLAUDE.md where the open marker begins. */
  startIdx: number;
  /** Index where the close marker ends (exclusive). */
  endIdx: number;
  /** The full match including markers — used to splice replacements. */
  rawBlock: string;
}

export function scanCandidates(agentId: string, claudeMd: string): PendingCandidate[] {
  const out: PendingCandidate[] = [];
  for (const m of claudeMd.matchAll(CANDIDATE_RE)) {
    const startIdx = m.index ?? 0;
    const endIdx = startIdx + m[0].length;
    const heading = nearestHeadingBefore(claudeMd, startIdx);
    out.push({
      agentId,
      domain: m[1].toLowerCase(),
      inner: m[2].trim(),
      heading,
      startIdx,
      endIdx,
      rawBlock: m[0],
    });
  }
  return out;
}

function nearestHeadingBefore(md: string, idx: number): string {
  const before = md.slice(0, idx);
  // Walk backward through h2 headings; the last (latest) match wins.
  let last: string | null = null;
  for (const m of before.matchAll(new RegExp(H2_RE.source, "gm"))) {
    last = m[1].trim();
  }
  return last ?? `Promoted lesson`;
}

/**
 * Replace a candidate's markers in place with a status comment. Used by the
 * review CLI after the human picks accept/reject — the source CLAUDE.md
 * keeps the body content but loses the candidate wrapping so the same block
 * never re-surfaces in the next review pass. Acquires the agent's CLAUDE.md
 * lock so a concurrent summarizer-append doesn't trample the splice.
 */
export async function replaceCandidateMarkers(input: {
  agentId: string;
  startIdx: number;
  endIdx: number;
  inner: string;
  status: "promoted" | "not-promoted";
  meta: string;
}): Promise<void> {
  const filePath = agentClaudeMdPath(input.agentId);
  await withFileLock(filePath, async () => {
    const current = await fs.readFile(filePath, "utf-8");
    // Re-locate the block by content, not by stale index — another summarizer
    // append between scan and apply would have shifted offsets but not the
    // contents of this exact wrapped block.
    const open = `<!-- promote-candidate:`;
    const close = `<!-- /promote-candidate -->`;
    const innerSlice = current.slice(input.startIdx, input.endIdx);
    let startIdx = input.startIdx;
    let endIdx = input.endIdx;
    if (!innerSlice.startsWith(open) || !current.slice(0, endIdx).endsWith(close)) {
      // Fall back to a content search using the original raw block.
      const probe = current.indexOf(input.inner);
      if (probe < 0) throw new Error(`candidate inner not found in ${filePath}`);
      // Find the open marker preceding it, and the close after it.
      const openIdx = current.lastIndexOf(open, probe);
      if (openIdx < 0) throw new Error(`open marker not found before inner`);
      const closeIdx = current.indexOf(close, probe + input.inner.length);
      if (closeIdx < 0) throw new Error(`close marker not found after inner`);
      startIdx = openIdx;
      endIdx = closeIdx + close.length;
    }
    const ts = new Date().toISOString();
    const replacement =
      input.status === "promoted"
        ? `<!-- promoted:${input.meta}:${ts} -->\n${input.inner}`
        : `<!-- not-promoted:${input.meta}:${ts} -->\n${input.inner}`;
    const next = current.slice(0, startIdx) + replacement + current.slice(endIdx);
    const tmp = `${filePath}.tmp.${process.pid}`;
    await fs.writeFile(tmp, next);
    await fs.rename(tmp, filePath);
  });
}
