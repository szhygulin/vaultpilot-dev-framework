// Pure parsing + validation helpers for cross-agent lesson promotion markers.
//
// Marker formats embedded into a per-agent CLAUDE.md by the summarizer:
//   <!-- promote-candidate:<domain> -->
//   <descriptive observation body, multi-line ok>
//   <!-- /promote-candidate -->
//
// After human review, the wrapping comment pair is rewritten in place to a
// single sentinel so the candidate doesn't resurface in the next review pass:
//   <!-- promoted:<domain>:<ts> -->        (accepted; body kept above)
//   <!-- not-promoted:<reason>:<ts> -->    (rejected)
//
// All file I/O lives in `src/agent/sharedLessons.ts` and `src/cli.ts`. Tested
// in `promotionMarkers.test.ts` (test runner globs `dist/src/util/*.test.js`).
//
// Format constraints applied at promotion time (per #33 path B + agent-6100's
// trust-boundary observation): cap each pool entry to MAX_ENTRY_LINES /
// MAX_ENTRY_CHARS, refuse empty bodies, surface imperative-voice phrasing as a
// warning so a human reviewer can think twice before accepting an entry that
// reads like instructions to a sibling agent.

const DOMAIN_RE = /^[a-z][a-z0-9-]*$/;
const PROMOTE_OPEN_RE = /^\s*<!--\s*promote-candidate:([a-z][a-z0-9-]*)\s*-->\s*$/;
const PROMOTE_CLOSE_RE = /^\s*<!--\s*\/promote-candidate\s*-->\s*$/;

export const MAX_ENTRY_LINES = 40;
export const MAX_ENTRY_CHARS = 1500;

export function isValidDomain(s: string): boolean {
  return DOMAIN_RE.test(s);
}

export interface PromoteCandidate {
  domain: string;
  body: string;
  /** 0-based line index of the opening `<!-- promote-candidate:... -->`. */
  startLine: number;
  /** 0-based line index of the closing `<!-- /promote-candidate -->` (inclusive). */
  endLine: number;
}

/**
 * Walk markdown content and return every well-formed promote-candidate block.
 * Malformed pairs (missing close, nested open) are silently skipped — the
 * review CLI surfaces a count of skipped vs found so the human notices.
 */
export function findPromoteCandidates(content: string): PromoteCandidate[] {
  const lines = content.split("\n");
  const out: PromoteCandidate[] = [];
  let i = 0;
  while (i < lines.length) {
    const open = lines[i].match(PROMOTE_OPEN_RE);
    if (!open) {
      i += 1;
      continue;
    }
    const domain = open[1];
    let close = -1;
    for (let j = i + 1; j < lines.length; j++) {
      // Reject nested opens — treat as malformed and skip the outer.
      if (PROMOTE_OPEN_RE.test(lines[j])) {
        close = -2;
        break;
      }
      if (PROMOTE_CLOSE_RE.test(lines[j])) {
        close = j;
        break;
      }
    }
    if (close < 0) {
      // No matching close (or nested open). Advance past the open so we don't
      // re-scan it; the human can fix the markup and re-run review.
      i += 1;
      continue;
    }
    const body = lines.slice(i + 1, close).join("\n");
    out.push({ domain, body, startLine: i, endLine: close });
    i = close + 1;
  }
  return out;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Hard rules (errors, append refused):
 *   - body trimmed must be non-empty
 *   - non-empty line count ≤ MAX_ENTRY_LINES
 *   - char count ≤ MAX_ENTRY_CHARS
 *
 * Soft rules (warnings, append allowed but flagged):
 *   - imperative second-person phrasing ("you must", "you should", "the agent
 *     must") — descriptive-observation rule from #33 plan; reviewers see the
 *     warning and can downgrade language before accepting.
 */
export function validateEntry(body: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    errors.push("entry body is empty");
    return { ok: false, errors, warnings };
  }
  const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length > MAX_ENTRY_LINES) {
    errors.push(
      `entry has ${lines.length} non-empty lines, exceeds MAX_ENTRY_LINES=${MAX_ENTRY_LINES}`,
    );
  }
  if (trimmed.length > MAX_ENTRY_CHARS) {
    errors.push(
      `entry has ${trimmed.length} chars, exceeds MAX_ENTRY_CHARS=${MAX_ENTRY_CHARS}`,
    );
  }
  const imperative =
    /\b(?:you (?:must|should|need to)|agents? (?:must|should)|the agent (?:must|should))\b/i;
  if (imperative.test(trimmed)) {
    warnings.push(
      "imperative phrasing detected — pool entries should be descriptive observations, not instructions to sibling agents",
    );
  }
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Replace a `<!-- promote-candidate -->...<!-- /promote-candidate -->` pair
 * in `content` with `replacement` (a single line, e.g. a `<!-- promoted -->`
 * sentinel). Lines between the markers ARE preserved — the review flow keeps
 * the lesson body in the source CLAUDE.md as historical record; only the
 * candidacy markers are rewritten. The replacement line takes the slot of the
 * opening marker; the closing marker is dropped.
 */
export function rewriteCandidateWrapping(
  content: string,
  candidate: PromoteCandidate,
  replacement: string,
): string {
  const lines = content.split("\n");
  if (candidate.startLine < 0 || candidate.endLine >= lines.length) {
    throw new Error(
      `candidate range (${candidate.startLine}..${candidate.endLine}) out of bounds (${lines.length})`,
    );
  }
  const before = lines.slice(0, candidate.startLine);
  const body = lines.slice(candidate.startLine + 1, candidate.endLine);
  const after = lines.slice(candidate.endLine + 1);
  return [...before, replacement, ...body, ...after].join("\n");
}

export function formatPromotedSentinel(domain: string, ts: string): string {
  return `<!-- promoted:${domain}:${ts} -->`;
}

export function formatNotPromotedSentinel(reason: string, ts: string): string {
  // Reasons may include spaces — the parser doesn't need to round-trip these,
  // they're informational only.
  const safe = reason.replace(/-->/g, "—>");
  return `<!-- not-promoted:${safe}:${ts} -->`;
}
