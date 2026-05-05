// Phase A (issue #172, of #169 split per Cook's pushback) — advisory-only
// intra-section prose tightening for an agent's CLAUDE.md.
//
// Compact (#158/#162) addresses *cross-section* growth: many sections
// share a thesis, merge them. Tighten addresses *within-section* growth:
// a single coherent section with verbose prose that could say the same
// thing in fewer bytes. Compact's splicer copies non-clustered sections
// verbatim, so verbose-but-distinct sections fall through both tools
// untouched today — this fills that gap.
//
// Phase A is purely advisory: it parses sections, asks an opus model to
// rewrite each body more concisely, validates the rewrite (Zod schema +
// dropped-invariant guards), and emits a per-section dry-run report. No
// file mutation. The destructive `--apply` path is deferred to issue #173,
// gated on Phase A having been exercised on real production CLAUDE.md
// files for at least one full month — same deferral pattern as #158→#162.
//
// Usage: `vp-dev agents tighten-claude-md <agentId> [--json] [--max-savings-pct N]`.

import { z } from "zod";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { claudeBinPath } from "./sdkBinary.js";
import { parseClaudeMdSections, type ParsedSection } from "./split.js";
import { parseJsonEnvelope } from "../util/parseJsonEnvelope.js";
import { ORCHESTRATOR_MODEL_SPLIT } from "../orchestrator/models.js";
import type { AgentRecord } from "../types.js";

// Shares compact's tier (opus) — both are full-CLAUDE.md → structured
// proposal calls and rewrite quality matters more than per-call cost. Env
// override flows through `models.ts`.
const TIGHTEN_MODEL = ORCHESTRATOR_MODEL_SPLIT;

// Default cap on per-section savings. Above this percentage the model is
// likely paraphrasing-with-loss rather than tightening — the validator
// catches dropped dates / xrefs / numerics, but watery rewrites (drop a
// "for example" clause that isn't a load-bearing date) can still erode
// nuance. Operator-tunable from CLI.
export const DEFAULT_MAX_SAVINGS_PCT = 40;

// Below this byte-savings floor the per-rewrite diff is low signal — a
// trivial trim that doesn't merit a wall-of-diff. Falls back to the
// single-line `[sN] X.YYKB saved` summary instead. Picked at 50 bytes
// per issue #176: catches "drop one filler phrase" (~30-50B) but lets
// substantive rewrites surface their diff.
export const MIN_DIFF_SAVINGS_BYTES = 50;

// Cap on per-rewrite diff body lines. 60 keeps the largest rewrite
// readable in a terminal scrollback without becoming a wall-of-text on
// near-total rewrites. Beyond the cap, the formatter appends a
// `… (N more lines truncated)` marker. Operator can re-run with `--json`
// (which carries `rewrittenBody` in full) to see the untruncated body.
export const DEFAULT_MAX_DIFF_LINES = 60;

// Per-field caps on the LLM proposal payload. `rewrittenBody` lower-bound
// is 1 (a section with empty body shouldn't appear in source — the parser
// trims whitespace, but a one-char body is technically valid). Upper bound
// matches compact's BODY_MAX so a verbose model emission gets clamped
// instead of hard-failing the whole proposal.
const BODY_MIN = 1;
const BODY_MAX = 6000;

export interface SectionRewrite {
  /** sectionId from `parseClaudeMdSections`. */
  sectionId: string;
  /** New body the model wants to substitute for the source body. */
  rewrittenBody: string;
  /** sourceBytes - rewrittenBytes. Always non-negative; rewrites that
   *  *grow* the body are dropped pre-validation (model misunderstood). */
  estimatedBytesSaved: number;
}

export interface TightenProposal {
  agentId: string;
  rewrites: SectionRewrite[];
  /** sectionIds the model declined to rewrite. Better to leave a tight
   *  section alone than force a worse rewrite. */
  unchangedSectionIds: string[];
  estimatedBytesSaved: number;
  inputBytes: number;
  sectionCount: number;
  /** Optional model-side note on caveats. */
  notes?: string;
  /** Per-rewrite validator findings. Phase A surfaces them as advisory;
   *  the destructive `--apply` path (#173) treats them as hard rejections. */
  warnings: TightenWarning[];
  /** Cap surfaced in the gate text — included for symmetry with the CLI
   *  flag so a `--json` consumer can see what threshold was applied. */
  maxSavingsPct: number;
}

export type TightenWarning =
  | {
      kind: "dropped-incident-date";
      sectionId: string;
      missingDates: string[];
    }
  | {
      kind: "dropped-cross-reference";
      sectionId: string;
      /** Cross-references like `#NNN` that appear in source but not rewrite. */
      missingRefs: string[];
    }
  | {
      kind: "dropped-numeric-threshold";
      sectionId: string;
      /** Numeric tunables like `30KB`, `50 turns`, `15 min`. */
      missingNumerics: string[];
    }
  | {
      kind: "excessive-savings";
      sectionId: string;
      savingsPct: number;
      maxSavingsPct: number;
    };

const RewriteSchema = z.object({
  sectionId: z.string().min(1),
  rewrittenBody: z.string().min(BODY_MIN).max(BODY_MAX),
});

const ProposalPayloadSchema = z.object({
  rewrites: z.array(RewriteSchema).default([]),
  unchangedSectionIds: z.array(z.string()).default([]),
  notes: z.string().max(500).optional(),
});

export function clampRewriteFields(json: unknown): unknown {
  if (!json || typeof json !== "object") return json;
  const obj = json as Record<string, unknown>;
  const out: Record<string, unknown> = { ...obj };
  const rewrites = obj.rewrites;
  if (Array.isArray(rewrites)) {
    out.rewrites = rewrites.map((r) => {
      if (!r || typeof r !== "object") return r;
      const rewrite = r as Record<string, unknown>;
      const rOut: Record<string, unknown> = { ...rewrite };
      if (
        typeof rewrite.rewrittenBody === "string" &&
        rewrite.rewrittenBody.length > BODY_MAX
      ) {
        rOut.rewrittenBody =
          rewrite.rewrittenBody.slice(0, BODY_MAX - 16) + "\n[…truncated]";
      }
      return rOut;
    });
  }
  if (typeof obj.notes === "string" && (obj.notes as string).length > 500) {
    out.notes = (obj.notes as string).slice(0, 500 - 16) + "\n[…truncated]";
  }
  return out;
}

// ISO date matcher — same regex as compact's, deliberately strict on shape
// so it doesn't false-positive on version numbers or arbitrary digit triples.
const DATE_RE = /\b(20\d{2}-\d{2}-\d{2})\b/g;

// Cross-reference matcher: `#42`, `#1234`. Catches issue/PR refs that
// dominate the project's lessons. Bare digit-only references without `#`
// are out of scope (too many false positives on numeric thresholds).
const XREF_RE = /#(\d{1,5})\b/g;

// Numeric-tunable matcher: a number plus a recognized unit. Conservative
// pattern — misses bare numerics (`K=3`, `factor 1.5`), but those are rare
// in this codebase's lessons relative to dated/unit'd numbers. Matches
// `30KB`, `50 turns`, `15 min`, `1.5×`, `40%`.
//
// `(?!\w)` instead of `\b` after the unit: `\b` requires a word/non-word
// transition, but `×` and `%` are non-word characters, so `\b` doesn't
// fire at end-of-string after them. Negative-lookahead-for-word-char
// covers both word units (KB, turns — fails on `KBd`) and symbolic units
// (×, % — succeeds at EOS or followed by whitespace/punctuation).
const NUMERIC_RE =
  /(\b\d+(?:\.\d+)?)\s*(KB|MB|GB|chars?|sections?|turns?|days?|hours?|min|sec|ms|%|x|×)(?!\w)/gi;

export function extractDistinctDates(body: string): Set<string> {
  const out = new Set<string>();
  for (const m of body.matchAll(DATE_RE)) out.add(m[1]);
  return out;
}

export function extractDistinctXrefs(body: string): Set<string> {
  const out = new Set<string>();
  for (const m of body.matchAll(XREF_RE)) out.add(`#${m[1]}`);
  return out;
}

export function extractDistinctNumerics(body: string): Set<string> {
  const out = new Set<string>();
  for (const m of body.matchAll(NUMERIC_RE)) {
    // Normalize unit case for stable comparison: `30KB` and `30 kb` are
    // the same numeric. Keep the *number* shape verbatim so `1.5` and `2`
    // stay distinct.
    out.add(`${m[1]}${m[2].toLowerCase()}`);
  }
  return out;
}

/**
 * Run the dropped-invariant validators against each rewrite. Phase A
 * surfaces every warning as advisory so the operator can review before
 * committing to a destructive Phase B path. Phase B (#173) will treat
 * any warning as a hard rejection at apply time.
 *
 * Three checks per rewrite:
 *   - Every ISO date `20XX-XX-XX` cited in source MUST appear in rewrite.
 *   - Every `#NNN` cross-reference cited in source MUST appear in rewrite.
 *   - Every numeric+unit pair (e.g. `30KB`, `50 turns`) cited in source
 *     MUST appear in rewrite.
 *
 * Plus a fourth, advisory-only check:
 *   - savingsPct ≤ maxSavingsPct. Above the cap the model is likely
 *     paraphrasing-with-loss rather than tightening; surface as a
 *     warning operator can choose to override.
 */
export function findDroppedInvariants(input: {
  rewrites: SectionRewrite[];
  sections: ParsedSection[];
  maxSavingsPct: number;
}): TightenWarning[] {
  const sectionById = new Map(input.sections.map((s) => [s.sectionId, s]));
  const warnings: TightenWarning[] = [];
  for (const r of input.rewrites) {
    const sec = sectionById.get(r.sectionId);
    if (!sec) continue; // caller validates section existence; defensive only

    const srcDates = extractDistinctDates(sec.body);
    const dstDates = extractDistinctDates(r.rewrittenBody);
    const missingDates = [...srcDates].filter((d) => !dstDates.has(d)).sort();
    if (missingDates.length > 0) {
      warnings.push({
        kind: "dropped-incident-date",
        sectionId: r.sectionId,
        missingDates,
      });
    }

    const srcRefs = extractDistinctXrefs(sec.body);
    const dstRefs = extractDistinctXrefs(r.rewrittenBody);
    const missingRefs = [...srcRefs].filter((x) => !dstRefs.has(x)).sort();
    if (missingRefs.length > 0) {
      warnings.push({
        kind: "dropped-cross-reference",
        sectionId: r.sectionId,
        missingRefs,
      });
    }

    const srcNums = extractDistinctNumerics(sec.body);
    const dstNums = extractDistinctNumerics(r.rewrittenBody);
    const missingNumerics = [...srcNums]
      .filter((n) => !dstNums.has(n))
      .sort();
    if (missingNumerics.length > 0) {
      warnings.push({
        kind: "dropped-numeric-threshold",
        sectionId: r.sectionId,
        missingNumerics,
      });
    }

    const srcBytes = Buffer.byteLength(sec.body, "utf-8");
    const dstBytes = Buffer.byteLength(r.rewrittenBody, "utf-8");
    if (srcBytes > 0) {
      const pct = ((srcBytes - dstBytes) / srcBytes) * 100;
      if (pct > input.maxSavingsPct) {
        warnings.push({
          kind: "excessive-savings",
          sectionId: r.sectionId,
          savingsPct: Math.round(pct * 10) / 10,
          maxSavingsPct: input.maxSavingsPct,
        });
      }
    }
  }
  return warnings;
}

export interface ProposeTightenInput {
  agent: AgentRecord;
  /** Current CLAUDE.md content for the agent. */
  claudeMd: string;
  /** Soft cap on per-section savings (advisory warning, not a hard reject
   *  in Phase A). Default 40 — rewrites shrinking the body by more than
   *  40% surface as `excessive-savings` warnings. */
  maxSavingsPct?: number;
}

export async function proposeTighten(
  input: ProposeTightenInput,
): Promise<TightenProposal> {
  const maxSavingsPct = input.maxSavingsPct ?? DEFAULT_MAX_SAVINGS_PCT;
  const sections = parseClaudeMdSections(input.claudeMd);
  const inputBytes = Buffer.byteLength(input.claudeMd, "utf-8");
  const base = {
    agentId: input.agent.agentId,
    inputBytes,
    sectionCount: sections.length,
    maxSavingsPct,
  };

  if (sections.length === 0) {
    return {
      ...base,
      rewrites: [],
      unchangedSectionIds: [],
      estimatedBytesSaved: 0,
      warnings: [],
      notes: "No attributable sections — nothing to tighten.",
    };
  }

  const userPrompt = buildTightenPrompt({ agent: input.agent, sections });
  let raw = "";
  const stream = query({
    prompt: userPrompt,
    options: {
      model: TIGHTEN_MODEL,
      systemPrompt: buildTightenSystemPrompt(),
      tools: [],
      permissionMode: "default",
      env: process.env,
      maxTurns: 1,
      settingSources: [],
      persistSession: false,
      pathToClaudeCodeExecutable: claudeBinPath(),
    },
  });
  for await (const msg of stream) {
    if (msg.type === "result") {
      if (msg.subtype === "success") raw = msg.result;
      else throw new Error(`tightenClaudeMd model failed: ${msg.subtype}`);
    }
  }

  const extracted = parseJsonEnvelope(raw, z.unknown());
  if (!extracted.ok) {
    throw new Error(
      `tightenClaudeMd output not valid JSON: ${extracted.error ?? "no envelope"}`,
    );
  }
  const clamped = clampRewriteFields(extracted.value);
  const parsed = ProposalPayloadSchema.safeParse(clamped);
  if (!parsed.success) {
    throw new Error(
      `tightenClaudeMd schema invalid: ${parsed.error.message.replace(/\s+/g, " ").slice(0, 400)}`,
    );
  }

  const validIds = new Set(sections.map((s) => s.sectionId));
  const sectionById = new Map(sections.map((s) => [s.sectionId, s]));
  const seenIds = new Set<string>();
  const rewrites: SectionRewrite[] = [];
  for (const r of parsed.data.rewrites) {
    if (!validIds.has(r.sectionId)) {
      throw new Error(
        `tightenClaudeMd rewrite references unknown sectionId ${r.sectionId}`,
      );
    }
    if (seenIds.has(r.sectionId)) {
      throw new Error(
        `tightenClaudeMd rewrite reuses sectionId ${r.sectionId}; each section may have at most one rewrite`,
      );
    }
    seenIds.add(r.sectionId);

    const sec = sectionById.get(r.sectionId);
    if (!sec) continue;
    const srcBytes = Buffer.byteLength(sec.body, "utf-8");
    const dstBytes = Buffer.byteLength(r.rewrittenBody, "utf-8");
    // Drop rewrites that *grow* the body — model misunderstood the task.
    // Don't surface them as unchanged either; the model should have
    // declined explicitly, and silently dropping protects the operator
    // from `--apply`-ing a "tightening" that bloats the file.
    if (dstBytes >= srcBytes) continue;
    rewrites.push({
      sectionId: r.sectionId,
      rewrittenBody: r.rewrittenBody,
      estimatedBytesSaved: srcBytes - dstBytes,
    });
  }

  const unchangedSectionIds = sections
    .map((s) => s.sectionId)
    .filter((id) => !rewrites.some((r) => r.sectionId === id));

  const estimatedBytesSaved = rewrites.reduce(
    (acc, r) => acc + r.estimatedBytesSaved,
    0,
  );
  const warnings = findDroppedInvariants({
    rewrites,
    sections,
    maxSavingsPct,
  });

  return {
    ...base,
    rewrites,
    unchangedSectionIds,
    estimatedBytesSaved,
    warnings,
    notes: parsed.data.notes,
  };
}

export function buildTightenSystemPrompt(): string {
  return `You tighten the prose of a coding agent's CLAUDE.md sections — rewrite each section body more concisely while preserving every load-bearing detail.

Input: a list of CLAUDE.md sections, each tagged with a sectionId, the issue it came from, the outcome, and the section heading + body. Each section is a coherent rule with no near-duplicates (cross-section dedup is a separate tool). Your job is to rewrite each body to be shorter while keeping every fact.

CRITICAL: lossless tightening means every load-bearing detail from the source body MUST appear in the rewrite. In particular:
- Every "Past incident YYYY-MM-DD" citation MUST be preserved verbatim — an automated validator checks this and flags rewrites that drop dates as unsafe.
- Every issue/PR cross-reference (#NNN) MUST be preserved.
- Every numeric threshold or tunable (30KB, 50 turns, 15 min, 1.5×, 40%) MUST be preserved.
- Every distinct mechanism or concrete recipe step MUST be preserved.
- "Tells" lists and "How to apply" steps MUST be preserved as bullets, not collapsed into prose.

What to cut:
- Filler phrases ("for example", "in particular", "essentially") that don't add information.
- Redundant rephrasing of the same idea ("X is Y" followed by "X means Y").
- Over-qualified hedges where one qualifier suffices.
- Long parenthetical asides that bury the rule.

Output rules:
- Each rewrite needs:
  - sectionId: the source section ID.
  - rewrittenBody: the tightened body. Bullets > prose. Cite every past-incident date verbatim. Preserve markdown structure (lists, code blocks, links).
- unchangedSectionIds: sections you decline to rewrite (already tight, or you can't shrink without dropping detail). Better to leave them than force a watery rewrite.
- notes: optional 1-2 sentences on caveats.
- A section may have AT MOST one rewrite. Don't propose two competing rewrites for the same section.

Output: a single JSON object, no fences, no prose:
  {"rewrites": [{"sectionId": "s0", "rewrittenBody": "..."}, ...], "unchangedSectionIds": ["s3","s4"], "notes": "..."}

Returning {"rewrites": [], "unchangedSectionIds": [...]} is acceptable when no section can be tightened without losing detail.`;
}

export function buildTightenPrompt(opts: {
  agent: AgentRecord;
  sections: ParsedSection[];
}): string {
  const sectionLines = opts.sections.map((s) => {
    const head = `[${s.sectionId}] issue=#${s.issueId ?? "?"} outcome=${s.outcome ?? "?"} run=${s.runId ?? "?"}`;
    return `${head}\n  heading: ${s.heading}\n  body:\n${indent(s.body, "    ")}`;
  });

  return `Agent ${opts.agent.agentId} has ${opts.sections.length} attributable sections. Rewrite each body more concisely while preserving every load-bearing detail.

Parent tags (${opts.agent.tags.length}):
${JSON.stringify(opts.agent.tags)}

Sections:
${sectionLines.join("\n\n")}

Emit the JSON object now. Decline to rewrite any section you can't shrink without dropping a date / cross-reference / numeric.`;
}

function indent(s: string, prefix: string): string {
  return s
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");
}

/**
 * Line-level LCS diff. Returns an edit script of `eq` (line in both
 * source and rewrite, in order), `del` (source only), and `add` (rewrite
 * only) ops. O(M·N) time and memory; bounded by `BODY_MAX = 6000` chars
 * per body so worst case is a few hundred lines × few hundred lines —
 * trivial.
 */
type DiffOp = { kind: "eq" | "del" | "add"; line: string };

export function lineDiff(srcLines: string[], dstLines: string[]): DiffOp[] {
  const m = srcLines.length;
  const n = dstLines.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (srcLines[i - 1] === dstLines[j - 1]) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
      }
    }
  }
  const ops: DiffOp[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && srcLines[i - 1] === dstLines[j - 1]) {
      ops.push({ kind: "eq", line: srcLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      ops.push({ kind: "add", line: dstLines[j - 1] });
      j--;
    } else {
      ops.push({ kind: "del", line: srcLines[i - 1] });
      i--;
    }
  }
  return ops.reverse();
}

/**
 * Render a unified diff for a single section rewrite. Headers are
 * `--- <sectionId> (source)` / `+++ <sectionId> (rewrite)`, followed by
 * a single hunk header `@@ -1,M +1,N @@` and the prefixed edit script.
 * Output is capped at `maxLines` body lines (excluding the three header
 * lines); on overflow a `… (N more lines truncated)` marker is appended.
 */
export function formatRewriteDiff(opts: {
  sectionId: string;
  sourceBody: string;
  rewrittenBody: string;
  maxLines?: number;
}): string {
  const maxLines = opts.maxLines ?? DEFAULT_MAX_DIFF_LINES;
  const srcLines = opts.sourceBody.split("\n");
  const dstLines = opts.rewrittenBody.split("\n");
  const ops = lineDiff(srcLines, dstLines);
  const out: string[] = [];
  out.push(`--- ${opts.sectionId} (source)`);
  out.push(`+++ ${opts.sectionId} (rewrite)`);
  out.push(`@@ -1,${srcLines.length} +1,${dstLines.length} @@`);
  let body: string[] = [];
  for (const op of ops) {
    const prefix = op.kind === "eq" ? "  " : op.kind === "del" ? "- " : "+ ";
    body.push(prefix + op.line);
  }
  if (body.length > maxLines) {
    const remaining = body.length - maxLines;
    body = body.slice(0, maxLines);
    body.push(`… (${remaining} more lines truncated)`);
  }
  return [...out, ...body].join("\n");
}

export interface FormatTightenProposalOpts {
  /** When true (default), each rewrite with savings ≥ `MIN_DIFF_SAVINGS_BYTES`
   *  is followed by an inline unified diff against its source body. CLI
   *  exposes the inverse as `--no-diff` for batch / wall-of-rewrites runs.
   *  When false, falls back to the prior savings-only summary. */
  showDiffs?: boolean;
  /** Cap on diff body lines per rewrite. Default `DEFAULT_MAX_DIFF_LINES`. */
  maxDiffLines?: number;
  /** Per-section source bodies, keyed by `sectionId`. Required for diff
   *  rendering; if a sectionId is absent from the map, the formatter
   *  silently falls back to the savings-only line for that rewrite (the
   *  proposal is still complete; the operator just loses the diff for
   *  that one section). The caller (CLI / tests) builds this from
   *  `parseClaudeMdSections(claudeMd)` since the proposal payload itself
   *  intentionally omits source bodies (see #176 out-of-scope: keep the
   *  --json payload lean). */
  sources?: Map<string, string>;
}

export function formatTightenProposal(
  p: TightenProposal,
  opts?: FormatTightenProposalOpts,
): string {
  const showDiffs = opts?.showDiffs ?? true;
  const maxDiffLines = opts?.maxDiffLines ?? DEFAULT_MAX_DIFF_LINES;
  const sources = opts?.sources;
  const lines: string[] = [];
  const heading = `Tighten proposal for ${p.agentId}`;
  lines.push(heading);
  lines.push("=".repeat(heading.length));
  lines.push(`  CLAUDE.md size:    ${(p.inputBytes / 1024).toFixed(1)}KB`);
  lines.push(`  Sections analyzed: ${p.sectionCount}`);
  lines.push(`  Rewrites proposed: ${p.rewrites.length}`);
  lines.push(`  Unchanged:         ${p.unchangedSectionIds.length}`);
  lines.push(
    `  Estimated savings: ${(p.estimatedBytesSaved / 1024).toFixed(1)}KB`,
  );
  lines.push(`  max-savings-pct:   ${p.maxSavingsPct}%`);
  lines.push("");
  if (p.rewrites.length === 0) {
    lines.push("  (no rewrites proposed)");
    if (p.notes) lines.push(`  ${p.notes}`);
    return lines.join("\n");
  }

  for (const r of p.rewrites) {
    const myWarnings = p.warnings.filter((w) => w.sectionId === r.sectionId);
    const savedKb = (r.estimatedBytesSaved / 1024).toFixed(2);
    lines.push(`  -> [${r.sectionId}] ${savedKb}KB saved`);
    for (const w of myWarnings) {
      if (w.kind === "dropped-incident-date") {
        lines.push(`     ⚠ DROPPED DATES: ${w.missingDates.join(", ")}`);
      } else if (w.kind === "dropped-cross-reference") {
        lines.push(`     ⚠ DROPPED REFS: ${w.missingRefs.join(", ")}`);
      } else if (w.kind === "dropped-numeric-threshold") {
        lines.push(`     ⚠ DROPPED NUMERICS: ${w.missingNumerics.join(", ")}`);
      } else if (w.kind === "excessive-savings") {
        lines.push(
          `     ⚠ EXCESSIVE SAVINGS: ${w.savingsPct}% > ${w.maxSavingsPct}% (likely paraphrasing-with-loss)`,
        );
      }
    }
    // Per-rewrite diff. Emitted only when (a) the operator hasn't opted
    // out via --no-diff, (b) savings clear the low-signal floor, and
    // (c) the caller supplied a source body for this section. Indented
    // 5 cols to nest under the `-> [sN]` summary line.
    if (
      showDiffs &&
      r.estimatedBytesSaved >= MIN_DIFF_SAVINGS_BYTES &&
      sources?.has(r.sectionId)
    ) {
      const sourceBody = sources.get(r.sectionId)!;
      const diff = formatRewriteDiff({
        sectionId: r.sectionId,
        sourceBody,
        rewrittenBody: r.rewrittenBody,
        maxLines: maxDiffLines,
      });
      lines.push("     diff:");
      for (const dl of diff.split("\n")) {
        lines.push(`       ${dl}`);
      }
    }
  }
  lines.push("");
  if (p.unchangedSectionIds.length > 0) {
    lines.push(
      `  Unchanged (${p.unchangedSectionIds.length}): ${p.unchangedSectionIds.join(", ")}`,
    );
  }
  if (p.notes) lines.push(`  Notes: ${p.notes}`);
  lines.push("");
  if (p.warnings.length > 0) {
    lines.push(
      `⚠ ${p.warnings.length} validator finding(s) — Phase A surfaces these as advisory; the destructive --apply path (#173) will reject any rewrite carrying a finding.`,
    );
  } else {
    lines.push(
      "No validator warnings. Phase A is advisory only; --apply is tracked at #173.",
    );
  }
  return lines.join("\n");
}
