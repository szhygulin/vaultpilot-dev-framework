// Empirical post-hoc lesson prune (#179 Phase 1, option C).
//
// Surfaces sections in an agent's CLAUDE.md that are eligible for removal
// based on the per-section utility data already collected by #178 Phase 1.
// Eligibility (from `findStaleSections` in `lessonUtility.ts`):
//   - "zero-reinforcement": no reinforcementRuns AND ≥ minSiblingsAfter
//     other sections introduced after this one.
//   - "pushback-dominant" (bonus J): pushbackRuns > reinforcementRuns AND
//     the same cool-off applies.
//
// Two-step token gate mirrors `compactClaudeMd` (#162) so the destructive
// path requires explicit operator review between proposal and apply:
//   vp-dev agents prune-lessons <agentId>           # advisory
//   vp-dev agents prune-lessons <agentId> --apply   # mints token
//   vp-dev agents prune-lessons <agentId> --confirm <token>   # rewrites
//
// File-hash binding in the token rejects the confirm if the agent's
// CLAUDE.md drifted between plan and confirm (concurrent appendBlock,
// hand-edit, summarizer run, etc.).

import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import { withFileLock } from "../state/locks.js";
import { agentClaudeMdPath } from "./specialization.js";
import {
  deriveStableSectionId,
  findStaleSections,
  type StaleSection,
} from "../state/lessonUtility.js";
import {
  dropSentinelsByStableId,
  type SentinelHeader,
} from "../util/sentinels.js";

export interface PrunedSection {
  stableId: string;
  reason: "zero-reinforcement" | "pushback-dominant";
  introducedRunId: string;
  introducedAt: string;
  siblingsIntroducedAfter: number;
  reinforcementRuns: number;
  pushbackRuns: number;
}

export interface PruneProposal {
  agentId: string;
  generatedAt: string;
  /** Sections eligible for removal. Empty when there's nothing to prune. */
  pruned: PrunedSection[];
  /** Bytes before the rewrite (informational). */
  bytesBefore: number;
  /** Configuration that produced this proposal. */
  minSiblingsAfter: number;
}

export interface ProposeLessonPruneInput {
  agentId: string;
  /** Override default cool-off; sections need this many later siblings. */
  minSiblingsAfter?: number;
  /** Pre-loaded file path for tests; defaults to `agentClaudeMdPath`. */
  claudeMdPathOverride?: string;
}

export async function proposeLessonPrune(
  input: ProposeLessonPruneInput,
): Promise<PruneProposal> {
  const stale = await findStaleSections({
    agentId: input.agentId,
    minSiblingsAfter: input.minSiblingsAfter,
  });
  const filePath = input.claudeMdPathOverride ?? agentClaudeMdPath(input.agentId);
  let currentBytes = 0;
  try {
    const content = await fs.readFile(filePath, "utf-8");
    currentBytes = Buffer.byteLength(content, "utf-8");
  } catch {
    // File missing — proposal is empty. Caller renders a clean "nothing to do."
  }
  return {
    agentId: input.agentId,
    generatedAt: new Date().toISOString(),
    pruned: stale.map(toPrunedSection),
    bytesBefore: currentBytes,
    minSiblingsAfter:
      input.minSiblingsAfter ??
      // Re-resolve via lessonUtility's default to keep the proposal self-describing.
      stale[0]?.siblingsIntroducedAfter !== undefined
        ? Math.min(...stale.map((s) => s.siblingsIntroducedAfter))
        : 10,
  };
}

function toPrunedSection(s: StaleSection): PrunedSection {
  return {
    stableId: s.record.sectionId,
    reason: s.reason,
    introducedRunId: s.record.introducedRunId,
    introducedAt: s.record.introducedAt,
    siblingsIntroducedAfter: s.siblingsIntroducedAfter,
    reinforcementRuns: s.record.reinforcementRuns.length,
    pushbackRuns: s.record.pushbackRuns.length,
  };
}

export function formatLessonPruneProposal(p: PruneProposal): string {
  const lines: string[] = [];
  lines.push(`Lesson-prune proposal for ${p.agentId}`);
  lines.push(
    `  CLAUDE.md size: ${(p.bytesBefore / 1024).toFixed(1)} KB`,
  );
  lines.push(
    `  Cool-off: at least ${p.minSiblingsAfter} sibling sections introduced after the candidate.`,
  );
  if (p.pruned.length === 0) {
    lines.push(
      "  Nothing to prune. All sections either have ≥ 1 reinforcement, are too young, or are pushback-balanced.",
    );
    return lines.join("\n");
  }
  lines.push(
    `  ${p.pruned.length} section(s) eligible for removal:`,
  );
  for (const s of p.pruned) {
    lines.push(
      `    [${s.reason}] ${s.stableId.slice(0, 12)}…  introduced ${s.introducedAt.slice(0, 10)} (${s.siblingsIntroducedAfter} later siblings, reinforcements=${s.reinforcementRuns}, pushbacks=${s.pushbackRuns})`,
    );
  }
  lines.push(
    "Pass --apply to mint a confirm token; --confirm <token> to perform the rewrite.",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Two-step token binding.
// ---------------------------------------------------------------------------

export function hashFile(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * proposalHash = sha256(JSON.stringify(stableIdsSorted) + sha256(currentFile))
 * Stable across plan/confirm so long as the proposal's drop set and the file
 * bytes don't change. Same recipe shape as `compactConfirm.computeProposalHash`.
 */
export function computePruneProposalHash(
  proposal: PruneProposal,
  currentFile: string,
): string {
  const sorted = [...proposal.pruned.map((s) => s.stableId)].sort();
  const fileHash = hashFile(currentFile);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(sorted))
    .update(fileHash)
    .digest("hex");
}

export interface ApplyLessonPruneInput {
  agentId: string;
  proposal: PruneProposal;
  expectedProposalHash: string;
  /** Override file path for tests; defaults to `agentClaudeMdPath`. */
  claudeMdPathOverride?: string;
}

export type ApplyLessonPruneResult =
  | {
      kind: "applied";
      bytesBefore: number;
      bytesAfter: number;
      sectionsDropped: number;
      droppedHeaders: SentinelHeader[];
    }
  | {
      kind: "drift-rejected";
      reason: "proposal-hash" | "missing-file" | "no-sections" | "no-match";
      details: string;
    };

export async function applyLessonPrune(
  input: ApplyLessonPruneInput,
): Promise<ApplyLessonPruneResult> {
  if (input.proposal.pruned.length === 0) {
    return {
      kind: "drift-rejected",
      reason: "no-sections",
      details: "Proposal has zero sections to drop; nothing to apply.",
    };
  }
  const filePath = input.claudeMdPathOverride ?? agentClaudeMdPath(input.agentId);
  return withFileLock(filePath, async () => {
    let current: string;
    try {
      current = await fs.readFile(filePath, "utf-8");
    } catch {
      return {
        kind: "drift-rejected",
        reason: "missing-file",
        details: `agents/${input.agentId}/CLAUDE.md no longer exists; nothing to prune.`,
      };
    }
    const computed = computePruneProposalHash(input.proposal, current);
    if (computed !== input.expectedProposalHash) {
      return {
        kind: "drift-rejected",
        reason: "proposal-hash",
        details:
          "CLAUDE.md content changed between --apply and --confirm. Re-run --apply to generate a fresh proposal + token.",
      };
    }
    const dropSet = new Set(input.proposal.pruned.map((s) => s.stableId));
    const result = dropSentinelsByStableId(current, dropSet, (header) => {
      const ids = header.issueIds ?? [header.issueId];
      return deriveStableSectionId(header.runId, ids);
    });
    if (result.droppedHeaders.length === 0) {
      return {
        kind: "drift-rejected",
        reason: "no-match",
        details:
          "No sentinel matched any stable ID in the proposal. The file may have been pruned out-of-band; re-run --apply.",
      };
    }
    const tmp = `${filePath}.tmp.${process.pid}`;
    await fs.writeFile(tmp, result.content);
    await fs.rename(tmp, filePath);
    return {
      kind: "applied",
      bytesBefore: Buffer.byteLength(current, "utf-8"),
      bytesAfter: Buffer.byteLength(result.content, "utf-8"),
      sectionsDropped: result.droppedHeaders.length,
      droppedHeaders: result.droppedHeaders,
    };
  });
}
