// Phase 3 of #177 (issue #180): per-section verdict (`keep` / `trim` / `drop`)
// for an agent's CLAUDE.md, combining the utility-scoring data from Phase 1
// (#178) with the context-cost curve from Phase 2 (#179).
//
// Operator-driven advisory only — no file mutation. Composes with the other
// three agent-memory tools:
//   compact-claude-md (#162) — same-thesis cluster merges
//   tighten-claude-md (#172) — intra-section prose shrink
//   prune-lessons     (#179 option C) — empirical staleness drop
// The destructive `--apply` path is deferred to Phase 4 (separate issue).
//
// Verdict shape:
//   benefit = utility / cost
//     where utility   ∈ [0, 1] = composeUtility(SectionUtilityRecord)
//           cost      = (sectionBytes / 1024) × contextCostFactor(totalBytes)
//   verdict = keep  if benefit ≥ KEEP_THRESHOLD
//             drop  if benefit < DROP_THRESHOLD
//             trim  otherwise
//
// Sections without a SectionUtilityRecord (ParsedSection with no provenance,
// or freshly-introduced before recordIntroduction fired) fall back to "keep"
// per the issue body's success metric — we have no signal yet, so we don't
// recommend dropping.

import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import { agentClaudeMdPath } from "./specialization.js";
import { parseClaudeMdSections, type ParsedSection } from "./split.js";
import {
  deriveStableSectionId,
  loadLessonUtility,
  type AgentUtilityFile,
  type SectionUtilityRecord,
} from "../state/lessonUtility.js";
import { contextCostFactor } from "../util/contextCostCurve.js";
import { withFileLock } from "../state/locks.js";
import {
  dropSentinelsByStableId,
  type SentinelHeader,
} from "../util/sentinels.js";

// ---------------------------------------------------------------------------
// Tunables. Defaults are conservative on the "keep" side: this is advisory,
// and the operator can sharpen DROP_THRESHOLD upward when calibration data
// supports it. Override via `proposeAssessment` opts.
// ---------------------------------------------------------------------------

export const DEFAULT_KEEP_THRESHOLD = 0.20;

/**
 * Sections introduced within this many days are protected from `drop` verdicts
 * at apply time. Too new to have accumulated signal; a fresh summarizer-emitted
 * lesson hasn't had a chance to be reinforced yet. Operator can override with
 * `--allow-drop-fresh` (passes `allowDropFresh: true` to `applyAssessment`).
 */
export const FRESH_SECTION_DROP_DAYS = 14;
export const DEFAULT_DROP_THRESHOLD = 0.05;
/** Days before a `lastReinforcedAt` decays to zero recency. */
export const DEFAULT_RECENCY_DECAY_DAYS = 60;
/** Reinforcement count saturating to recency=1 contribution. */
export const REINFORCEMENT_SATURATION = 5;
/** Pushback count saturating to pushback=1 contribution. */
export const PUSHBACK_SATURATION = 3;
/** Past-incident count saturating to incident-density=1. */
export const INCIDENT_SATURATION = 3;
/** Cross-reference count saturating to centrality=1. */
export const CROSS_REF_SATURATION = 3;

export interface UtilityWeights {
  reinforcement: number;
  pushback: number;
  pastIncident: number;
  recency: number;
  crossReference: number;
}

export const DEFAULT_UTILITY_WEIGHTS: Readonly<UtilityWeights> = {
  reinforcement: 0.35,
  pushback: 0.25,
  pastIncident: 0.15,
  recency: 0.10,
  crossReference: 0.15,
};

// ---------------------------------------------------------------------------
// Utility composition — pure, well-defined, exported for tests.
// ---------------------------------------------------------------------------

export interface UtilityBreakdown {
  reinforcement: number;
  pushback: number;
  pastIncident: number;
  recency: number;
  crossReference: number;
}

export interface ComposeUtilityInput {
  record: SectionUtilityRecord;
  /** Reference timestamp for recency decay; defaults to "now". */
  now?: Date;
  weights?: UtilityWeights;
  recencyDecayDays?: number;
}

export interface ComposeUtilityResult {
  utility: number;
  breakdown: UtilityBreakdown;
}

export function composeUtility(input: ComposeUtilityInput): ComposeUtilityResult {
  const w = input.weights ?? DEFAULT_UTILITY_WEIGHTS;
  validateWeights(w);
  const decayDays = input.recencyDecayDays ?? DEFAULT_RECENCY_DECAY_DAYS;
  const now = input.now ?? new Date();
  const r = input.record;

  const reinforcement = saturate(r.reinforcementRuns.length, REINFORCEMENT_SATURATION);
  const pushback = saturate(r.pushbackRuns.length, PUSHBACK_SATURATION);
  const pastIncident = saturate(r.pastIncidentDates.length, INCIDENT_SATURATION);
  const crossReference = saturate(r.crossReferenceCount, CROSS_REF_SATURATION);
  const recency = recencyContribution(r.lastReinforcedAt, now, decayDays);

  const breakdown: UtilityBreakdown = {
    reinforcement,
    pushback,
    pastIncident,
    recency,
    crossReference,
  };
  const utility =
    w.reinforcement * reinforcement +
    w.pushback * pushback +
    w.pastIncident * pastIncident +
    w.recency * recency +
    w.crossReference * crossReference;
  return { utility, breakdown };
}

function saturate(count: number, ceiling: number): number {
  if (count <= 0) return 0;
  if (count >= ceiling) return 1;
  return count / ceiling;
}

function recencyContribution(
  lastReinforcedAt: string | undefined,
  now: Date,
  decayDays: number,
): number {
  if (!lastReinforcedAt) return 0;
  const last = Date.parse(lastReinforcedAt);
  if (!Number.isFinite(last)) return 0;
  const days = (now.getTime() - last) / (1000 * 60 * 60 * 24);
  if (days <= 0) return 1;
  if (days >= decayDays) return 0;
  return 1 - days / decayDays;
}

function validateWeights(w: UtilityWeights): void {
  const sum =
    w.reinforcement + w.pushback + w.pastIncident + w.recency + w.crossReference;
  if (Math.abs(sum - 1) > 1e-6) {
    throw new Error(
      `composeUtility: weights must sum to 1.0, got ${sum} ` +
        `(reinforcement=${w.reinforcement}, pushback=${w.pushback}, ` +
        `pastIncident=${w.pastIncident}, recency=${w.recency}, ` +
        `crossReference=${w.crossReference})`,
    );
  }
  for (const [k, v] of Object.entries(w)) {
    if (v < 0) throw new Error(`composeUtility: ${k} weight must be ≥ 0`);
  }
}

// ---------------------------------------------------------------------------
// Verdict + sub-recommendation.
// ---------------------------------------------------------------------------

export type Verdict = "keep" | "trim" | "drop";

export interface SectionAssessment {
  /** Position-based ID from parseClaudeMdSections (s0, s1, ...). */
  sectionId: string;
  /** Stable utility-record ID, or null when no provenance is available. */
  stableId: string | null;
  heading: string;
  bytes: number;
  verdict: Verdict;
  utility: number;
  utilityBreakdown: UtilityBreakdown;
  /** Cost factor pulled from contextCostFactor at the agent's current size. */
  contextCostFactor: number;
  /** sectionBytes / 1024 × contextCostFactor — KB-equivalent cost. */
  effectiveCostKb: number;
  benefit: number;
  /** True when this section had no SectionUtilityRecord (fallback to keep). */
  missingUtilityRecord: boolean;
  /** Surface-level counts for the formatter and operator scanning. */
  reinforcementRuns: number;
  pushbackRuns: number;
  incidentDates: number;
  daysSinceLastReinforcement: number | null;
  crossReferenceCount: number;
  /** One-line verdict-specific note (trim sub-recommendation, drop reasoning). */
  note?: string;
}

export interface AssessProposal {
  agentId: string;
  generatedAt: string;
  totalBytes: number;
  sectionCount: number;
  contextCostFactor: number;
  /** Mean utility across sections (excluding missing-record fallbacks). */
  compositeUtility: number;
  weights: UtilityWeights;
  keepThreshold: number;
  dropThreshold: number;
  recencyDecayDays: number;
  sections: SectionAssessment[];
  summary: {
    keep: number;
    trim: number;
    drop: number;
    missingRecord: number;
  };
  /** Aggregate "drop X (~YKB), trim Z (~WKB), projected total" line. */
  recommendation: string;
}

export interface ProposeAssessmentInput {
  agentId: string;
  /** Override path for tests; defaults to `agentClaudeMdPath`. */
  claudeMdPathOverride?: string;
  /** Override utility file (testability) — bypasses disk read. */
  utilityFileOverride?: AgentUtilityFile | null;
  /** Reference time for recency decay; defaults to "now". */
  now?: Date;
  weights?: UtilityWeights;
  keepThreshold?: number;
  dropThreshold?: number;
  recencyDecayDays?: number;
}

export async function proposeAssessment(
  input: ProposeAssessmentInput,
): Promise<AssessProposal> {
  const filePath = input.claudeMdPathOverride ?? agentClaudeMdPath(input.agentId);
  const weights = input.weights ?? DEFAULT_UTILITY_WEIGHTS;
  validateWeights(weights);
  const keepThreshold = input.keepThreshold ?? DEFAULT_KEEP_THRESHOLD;
  const dropThreshold = input.dropThreshold ?? DEFAULT_DROP_THRESHOLD;
  if (dropThreshold > keepThreshold) {
    throw new Error(
      `proposeAssessment: dropThreshold (${dropThreshold}) must be ≤ keepThreshold (${keepThreshold})`,
    );
  }
  const recencyDecayDays = input.recencyDecayDays ?? DEFAULT_RECENCY_DECAY_DAYS;
  const now = input.now ?? new Date();

  let claudeMd = "";
  try {
    claudeMd = await fs.readFile(filePath, "utf-8");
  } catch {
    // Missing file → empty proposal. Caller renders "nothing to assess".
  }
  const totalBytes = Buffer.byteLength(claudeMd, "utf-8");
  const sections = parseClaudeMdSections(claudeMd);

  const utilityFile =
    input.utilityFileOverride !== undefined
      ? input.utilityFileOverride
      : await loadLessonUtility(input.agentId);

  const recordsByStableId = new Map<string, SectionUtilityRecord>();
  if (utilityFile) {
    for (const r of utilityFile.sections) {
      recordsByStableId.set(r.sectionId, r);
    }
  }

  const ccf = contextCostFactor(totalBytes, { clampHigh: true });

  const summary = { keep: 0, trim: 0, drop: 0, missingRecord: 0 };
  const utilities: number[] = [];

  const assessments: SectionAssessment[] = sections.map((section) => {
    const stableId = stableIdFor(section);
    const record = stableId ? recordsByStableId.get(stableId) : undefined;
    const bytes = sectionBytes(section);
    const effectiveCostKb = (bytes / 1024) * ccf;

    if (!record) {
      summary.missingRecord++;
      return {
        sectionId: section.sectionId,
        stableId,
        heading: section.heading,
        bytes,
        verdict: "keep",
        utility: 0,
        utilityBreakdown: zeroBreakdown(),
        contextCostFactor: ccf,
        effectiveCostKb,
        benefit: 0,
        missingUtilityRecord: true,
        reinforcementRuns: 0,
        pushbackRuns: 0,
        incidentDates: 0,
        daysSinceLastReinforcement: null,
        crossReferenceCount: 0,
        note: "no utility record yet — kept by default until signal accumulates",
      };
    }

    const composed = composeUtility({
      record,
      now,
      weights,
      recencyDecayDays,
    });
    utilities.push(composed.utility);
    const benefit = effectiveCostKb > 0 ? composed.utility / effectiveCostKb : 0;

    let verdict: Verdict;
    if (benefit >= keepThreshold) verdict = "keep";
    else if (benefit < dropThreshold) verdict = "drop";
    else verdict = "trim";
    summary[verdict]++;

    return {
      sectionId: section.sectionId,
      stableId,
      heading: section.heading,
      bytes,
      verdict,
      utility: composed.utility,
      utilityBreakdown: composed.breakdown,
      contextCostFactor: ccf,
      effectiveCostKb,
      benefit,
      missingUtilityRecord: false,
      reinforcementRuns: record.reinforcementRuns.length,
      pushbackRuns: record.pushbackRuns.length,
      incidentDates: record.pastIncidentDates.length,
      daysSinceLastReinforcement: daysSince(record.lastReinforcedAt, now),
      crossReferenceCount: record.crossReferenceCount,
      note: verdictNote(verdict, section, record, composed.breakdown),
    };
  });

  const compositeUtility =
    utilities.length > 0
      ? utilities.reduce((a, b) => a + b, 0) / utilities.length
      : 0;

  return {
    agentId: input.agentId,
    generatedAt: now.toISOString(),
    totalBytes,
    sectionCount: sections.length,
    contextCostFactor: ccf,
    compositeUtility,
    weights,
    keepThreshold,
    dropThreshold,
    recencyDecayDays,
    sections: assessments,
    summary,
    recommendation: composeRecommendation(assessments, summary, totalBytes, ccf),
  };
}

// ---------------------------------------------------------------------------
// Internal hash helper — mirrors assessConfirm.computeAssessHash but lives
// here to avoid a circular import (assessConfirm.ts imports AssessProposal
// from this module). assessConfirm.ts re-exports the same algorithm for CLI
// callers that don't import assessClaudeMd directly.
// ---------------------------------------------------------------------------

function hashFileContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Recompute the assessHash from a proposal + file content.
 * Used inside `applyAssessment` (under the file lock) to verify no drift
 * occurred between --apply and --confirm.
 *
 * Formula mirrors assessConfirm.computeAssessHash:
 *   sha256(JSON.stringify(sortedVerdicts) + sha256(currentFile))
 */
function recomputeAssessHash(proposal: AssessProposal, currentFile: string): string {
  const verdicts = proposal.sections
    .map((s) => ({ stableId: s.stableId, verdict: s.verdict }))
    .sort((a, b) => (a.stableId ?? "").localeCompare(b.stableId ?? ""));
  const fileHash = hashFileContent(currentFile);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(verdicts))
    .update(fileHash)
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Phase 4 (issue #181): destructive applyAssessment — DROP-ONLY.
//
// Applies `drop` verdicts from a Phase 3 proposal under `withFileLock`.
// `trim` verdicts are surfaced in the result but NOT acted on (Phase 4b).
// `keep` verdicts are silent no-ops.
//
// Apply-time invariants (all checked under the lock):
//   1. assessHash matches (file drifted between --apply and --confirm → reject).
//   2. Each drop verdict's stableId must resolve to a live section in the
//      current file. Drift → reject.
//   3. Hard reject any drop for a section introduced within FRESH_SECTION_DROP_DAYS.
//      Override: allowDropFresh = true (--allow-drop-fresh CLI flag).
//   4. Hard reject any drop for a section with crossReferenceCount > 0.
//      No override — external citations would be orphaned.
//
// Verdict computation re-run choice (#181 note): The assessHash already binds
// to the file bytes AND the verdicts at plan time, so any file change that
// would alter verdicts also invalidates the hash. We do NOT re-run the full
// Phase 3 LLM-free scoring here — hash-drift is sufficient as a drift gate,
// and re-running at confirm time would need the utility file which may itself
// have drifted. The fresh-section and cross-ref guards run against the live
// utility file, covering the cases that are orthogonal to file content.
// ---------------------------------------------------------------------------

export interface ApplyAssessmentInput {
  agentId: string;
  /** Proposal from the --apply step. */
  proposal: AssessProposal;
  /** assessHash recorded in the confirm token at plan time. */
  expectedAssessHash: string;
  /** Override file path for tests; defaults to `agentClaudeMdPath`. */
  claudeMdPathOverride?: string;
  /** Override utility file for tests; when omitted, load from disk. */
  utilityFileOverride?: AgentUtilityFile | null;
  /** Reference time for the fresh-section guard; defaults to "now". */
  now?: Date;
  /**
   * When true, bypasses the 14-day fresh-section hard reject for drop verdicts.
   * Operator flag: --allow-drop-fresh. Same shape as compact's --allow-pair-clusters.
   */
  allowDropFresh?: boolean;
}

export type ApplyAssessmentResult =
  | {
      kind: "applied";
      bytesBefore: number;
      bytesAfter: number;
      sectionsDropped: number;
      droppedHeaders: SentinelHeader[];
      /** Number of sections with trim verdict — surfaced but not acted on. */
      trimSurfaced: number;
    }
  | {
      kind: "drift-rejected";
      reason:
        | "assess-hash"
        | "missing-file"
        | "fresh-section"
        | "cross-ref"
        | "no-drop-match";
      details: string;
    };

/**
 * Apply a Phase 3 proposal's `drop` verdicts to the agent's CLAUDE.md.
 * All steps run under `withFileLock` for atomicity.
 */
export async function applyAssessment(
  input: ApplyAssessmentInput,
): Promise<ApplyAssessmentResult> {
  const filePath = input.claudeMdPathOverride ?? agentClaudeMdPath(input.agentId);
  const now = input.now ?? new Date();

  // Pre-check existence before acquiring the lock so withFileLock's ensureDir
  // call doesn't error on a fully non-existent path.
  try {
    await fs.access(filePath);
  } catch {
    return {
      kind: "drift-rejected",
      reason: "missing-file",
      details: `agents/${input.agentId}/CLAUDE.md no longer exists; nothing to apply.`,
    };
  }

  return withFileLock(filePath, async () => {
    // Step 1: re-read the live file (file could disappear between access and lock).
    let currentFile: string;
    try {
      currentFile = await fs.readFile(filePath, "utf-8");
    } catch {
      return {
        kind: "drift-rejected",
        reason: "missing-file",
        details: `agents/${input.agentId}/CLAUDE.md no longer exists; nothing to apply.`,
      };
    }

    // Step 2: recompute assessHash and reject on drift.
    const computedHash = recomputeAssessHash(input.proposal, currentFile);
    if (computedHash !== input.expectedAssessHash) {
      return {
        kind: "drift-rejected",
        reason: "assess-hash",
        details:
          "CLAUDE.md content changed between --apply and --confirm. Re-run --apply to generate a fresh proposal + token.",
      };
    }

    // Step 3: resolve utility file for the fresh-section and cross-ref guards.
    const utilityFile =
      input.utilityFileOverride !== undefined
        ? input.utilityFileOverride
        : await loadLessonUtility(input.agentId);

    const recordByStableId = new Map<string, SectionUtilityRecord>();
    if (utilityFile) {
      for (const r of utilityFile.sections) {
        recordByStableId.set(r.sectionId, r);
      }
    }

    // Step 4: collect drop verdicts and run the hard invariant checks.
    const dropSections = input.proposal.sections.filter(
      (s) => s.verdict === "drop" && s.stableId !== null,
    );
    const trimSections = input.proposal.sections.filter(
      (s) => s.verdict === "trim",
    );

    for (const s of dropSections) {
      if (s.stableId === null) continue;
      const record = recordByStableId.get(s.stableId);

      // Fresh-section guard: introduced within FRESH_SECTION_DROP_DAYS.
      if (!input.allowDropFresh && record?.introducedAt) {
        const introduced = Date.parse(record.introducedAt);
        if (Number.isFinite(introduced)) {
          const daysOld = (now.getTime() - introduced) / (1000 * 60 * 60 * 24);
          if (daysOld < FRESH_SECTION_DROP_DAYS) {
            return {
              kind: "drift-rejected",
              reason: "fresh-section",
              details:
                `Section "${s.heading}" (stableId ${s.stableId.slice(0, 12)}…) ` +
                `is too new to drop: introduced ${record.introducedAt.slice(0, 10)}, ` +
                `${daysOld.toFixed(1)} days ago (< ${FRESH_SECTION_DROP_DAYS}-day minimum). ` +
                `Use --allow-drop-fresh to override.`,
            };
          }
        }
      }

      // Cross-ref guard: section cited externally — no override flag.
      const crossRefCount = record?.crossReferenceCount ?? s.crossReferenceCount;
      if (crossRefCount > 0) {
        return {
          kind: "drift-rejected",
          reason: "cross-ref",
          details:
            `Section "${s.heading}" (stableId ${s.stableId.slice(0, 12)}…) ` +
            `has crossReferenceCount=${crossRefCount} — external citations would be orphaned. ` +
            `Drop is hard-rejected; remove the cross-references before re-assessing.`,
        };
      }
    }

    // Step 5: If no drops, just report applied with 0 drops (all keep/trim).
    if (dropSections.length === 0) {
      return {
        kind: "applied",
        bytesBefore: Buffer.byteLength(currentFile, "utf-8"),
        bytesAfter: Buffer.byteLength(currentFile, "utf-8"),
        sectionsDropped: 0,
        droppedHeaders: [],
        trimSurfaced: trimSections.length,
      };
    }

    // Step 6: Splice the file — drop the flagged sentinels by stableId.
    const dropSet = new Set(
      dropSections.map((s) => s.stableId).filter((id): id is string => id !== null),
    );

    const spliceResult = dropSentinelsByStableId(
      currentFile,
      dropSet,
      (header: SentinelHeader) => {
        const ids = header.issueIds ?? [header.issueId];
        return deriveStableSectionId(header.runId, ids);
      },
    );

    // Step 7: Atomic rename write — same pattern as appendBlock / applyLessonPrune.
    const tmp = `${filePath}.tmp.${process.pid}`;
    await fs.writeFile(tmp, spliceResult.content);
    await fs.rename(tmp, filePath);

    return {
      kind: "applied",
      bytesBefore: Buffer.byteLength(currentFile, "utf-8"),
      bytesAfter: Buffer.byteLength(spliceResult.content, "utf-8"),
      sectionsDropped: spliceResult.droppedHeaders.length,
      droppedHeaders: spliceResult.droppedHeaders,
      trimSurfaced: trimSections.length,
    };
  });
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function stableIdFor(section: ParsedSection): string | null {
  if (!section.runId) return null;
  const ids =
    section.issueIds && section.issueIds.length > 0
      ? section.issueIds
      : section.issueId !== undefined
        ? [section.issueId]
        : null;
  if (!ids || ids.length === 0) return null;
  return deriveStableSectionId(section.runId, ids);
}

function sectionBytes(section: ParsedSection): number {
  // Heading + body + blank-line + sentinel-comment overhead. Not exact, but
  // accurate enough for "is this section earning its keep?" judgments.
  return Buffer.byteLength(`## ${section.heading}\n${section.body}\n`, "utf-8");
}

function daysSince(iso: string | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (now.getTime() - t) / (1000 * 60 * 60 * 24));
}

function zeroBreakdown(): UtilityBreakdown {
  return {
    reinforcement: 0,
    pushback: 0,
    pastIncident: 0,
    recency: 0,
    crossReference: 0,
  };
}

function verdictNote(
  verdict: Verdict,
  section: ParsedSection,
  record: SectionUtilityRecord,
  breakdown: UtilityBreakdown,
): string {
  if (verdict === "keep") {
    return `${record.reinforcementRuns.length} reinforcement(s), ${record.pushbackRuns.length} pushback(s); earning its bytes`;
  }
  if (verdict === "drop") {
    const reasons: string[] = [];
    if (record.reinforcementRuns.length === 0) reasons.push("never reinforced");
    if (record.pushbackRuns.length === 0) reasons.push("no pushback citations");
    if (record.pastIncidentDates.length === 0) reasons.push("no recurring incident");
    if (breakdown.recency === 0 && record.lastReinforcedAt)
      reasons.push("recency decayed to zero");
    if (reasons.length === 0) reasons.push("low utility per byte-equivalent");
    return reasons.join("; ");
  }
  // verdict === "trim" — emit a sub-recommendation when we can.
  return trimSuggestion(section, record);
}

function trimSuggestion(
  section: ParsedSection,
  record: SectionUtilityRecord,
): string {
  // 1. Multiple dated past-incidents → drop the oldest, keep the rule.
  if (record.pastIncidentDates.length >= 2) {
    const sorted = [...record.pastIncidentDates].sort();
    const oldest = sorted[0];
    return `drop the ${oldest} dated example; keep the rule`;
  }
  // 2. Long preamble before the rule statement (heuristic: the body has more
  //    than 3 paragraphs ABOVE a `**Rule:**` / `Rule:` marker).
  const preambleHint = preambleSuggestion(section.body);
  if (preambleHint) return preambleHint;
  // 3. Many bullets but only one was reinforced — we can't track per-bullet
  //    reinforcement, but if the section has many bullets and ref ≤ 1, the
  //    operator should review for never-cited bullets.
  const bullets = countBullets(section.body);
  if (bullets >= 6 && record.reinforcementRuns.length <= 1) {
    return `${bullets} bullets but only ${record.reinforcementRuns.length} reinforcement; review for never-cited bullets`;
  }
  return "trim non-essential prose; keep the rule statement";
}

function preambleSuggestion(body: string): string | null {
  const ruleIdx = body.search(/(^|\n)\*\*Rule:\*\*|\*\*Why:\*\*|\*\*Rule\*\*|\bRule:/);
  if (ruleIdx <= 0) return null;
  const preamble = body.slice(0, ruleIdx);
  const paragraphs = preamble.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  if (paragraphs.length >= 3) {
    return `tighten the ${paragraphs.length}-paragraph preamble before the Rule: line (composes with tighten-claude-md)`;
  }
  return null;
}

function countBullets(body: string): number {
  let count = 0;
  for (const line of body.split("\n")) {
    if (/^\s*[-*+]\s+/.test(line)) count++;
  }
  return count;
}

function composeRecommendation(
  sections: SectionAssessment[],
  summary: { keep: number; trim: number; drop: number; missingRecord: number },
  totalBytes: number,
  ccf: number,
): string {
  if (sections.length === 0) return "Nothing to assess (no attributable sections found).";
  const dropBytes = sections
    .filter((s) => s.verdict === "drop")
    .reduce((a, s) => a + s.bytes, 0);
  const trimBytes = sections
    .filter((s) => s.verdict === "trim")
    .reduce((a, s) => a + s.bytes, 0);
  // Trims typically recover ~30% of their bytes (rough heuristic for the
  // surfaced projection; the actual recovered amount depends on what
  // tighten-claude-md or compact-claude-md achieves on the trimmed sections).
  const projectedRecovered = dropBytes + Math.round(trimBytes * 0.3);
  const projectedTotal = Math.max(0, totalBytes - projectedRecovered);
  const projectedCcf = contextCostFactor(projectedTotal, { clampHigh: true });
  if (summary.drop === 0 && summary.trim === 0) {
    return `Nothing to act on. ${summary.keep} keep, ${summary.missingRecord} missing-record (kept by default). Composite utility healthy at the current ${(totalBytes / 1024).toFixed(1)}KB / ${ccf.toFixed(2)}× cost factor.`;
  }
  return (
    `Drop ${summary.drop} section(s) (~${(dropBytes / 1024).toFixed(1)}KB), ` +
    `trim ${summary.trim} (~${(trimBytes / 1024).toFixed(1)}KB) ` +
    `→ projected ${(projectedTotal / 1024).toFixed(1)}KB / context-cost ${projectedCcf.toFixed(2)}×. ` +
    `Composes with: vp-dev agents tighten-claude-md, vp-dev agents compact-claude-md, vp-dev agents prune-lessons.`
  );
}

// ---------------------------------------------------------------------------
// Formatter — human-readable table output mirroring the issue body's mock.
// ---------------------------------------------------------------------------

export function formatAssessProposal(p: AssessProposal): string {
  const lines: string[] = [];
  lines.push(`Health assessment for ${p.agentId}`);
  lines.push("=".repeat(33));
  lines.push(`  Total bytes:           ${(p.totalBytes / 1024).toFixed(1)}KB`);
  lines.push(`  Sections:              ${p.sectionCount}`);
  lines.push(`  Composite utility:     ${p.compositeUtility.toFixed(2)}`);
  lines.push(
    `  Context-cost factor:   ${p.contextCostFactor.toFixed(2)}× ` +
      `(${(p.totalBytes / 1024).toFixed(1)}KB puts marginal byte cost at ~${p.contextCostFactor.toFixed(1)}× baseline)`,
  );
  const overhead = (p.totalBytes / 1024) * p.contextCostFactor;
  lines.push(
    `  Effective overhead:    ${(p.totalBytes / 1024).toFixed(1)} × ${p.contextCostFactor.toFixed(2)} = ${overhead.toFixed(1)}KB-equivalent context impact`,
  );
  lines.push("");

  if (p.sections.length === 0) {
    lines.push("  No attributable sections found.");
    return lines.join("\n");
  }

  lines.push("  Per-section verdict:");
  for (const s of p.sections) {
    const lastCited =
      s.daysSinceLastReinforcement === null
        ? "N/A"
        : `${Math.round(s.daysSinceLastReinforcement)}d`;
    const utility = s.missingUtilityRecord ? "  n/a" : s.utility.toFixed(2);
    const verdictPad = s.verdict.padEnd(7);
    const headingTrunc = truncate(s.heading, 56);
    lines.push(
      `    [${s.sectionId}] ${verdictPad} util=${utility} ref=${s.reinforcementRuns} pushback=${s.pushbackRuns} incidents=${s.incidentDates} last-cited=${lastCited}  ${headingTrunc}`,
    );
    if (s.note) {
      lines.push(`         → ${s.note}`);
    }
  }
  lines.push("");
  lines.push("  Recommendation:");
  for (const wrap of wrapText(p.recommendation, 76, "    ")) {
    lines.push(wrap);
  }
  return lines.join("\n");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function wrapText(text: string, width: number, indent: string): string[] {
  const out: string[] = [];
  const words = text.split(/\s+/);
  let line = indent;
  for (const w of words) {
    if (line.length + w.length + 1 > width && line.trim().length > 0) {
      out.push(line.trimEnd());
      line = indent + w + " ";
    } else {
      line += w + " ";
    }
  }
  if (line.trim().length > 0) out.push(line.trimEnd());
  return out;
}
