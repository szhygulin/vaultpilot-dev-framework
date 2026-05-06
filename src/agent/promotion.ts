// Orchestrator-side promotion flow for cross-agent shared lessons (#33).
//
// Walks every active agent's CLAUDE.md, finds `<!-- promote-candidate -->`
// blocks the summarizer tagged on prior runs, and exposes accept/reject
// helpers that the `vp-dev lessons review` CLI drives interactively. All
// reads + writes happen here — the coding agent never touches `.shared/`.

import { promises as fs } from "node:fs";
import {
  appendLessonToPool,
  type AppendLessonOutcome,
  type LessonTier,
} from "./sharedLessons.js";
import {
  appendToLocalClaudeQueue,
  type AppendLocalClaudeQueueOutcome,
  type LocalClaudeUtilityGateResult,
} from "./localClaudeQueue.js";
import { agentClaudeMdPath } from "./specialization.js";
import { withFileLock } from "../state/locks.js";
import {
  findPromoteCandidates,
  formatNotPromotedSentinel,
  formatPromotedSentinel,
  isLocalClaudeCandidate,
  rewriteCandidateWrapping,
  validateEntry,
  type PromoteCandidate,
  type ValidationResult,
} from "../util/promotionMarkers.js";
import type { AgentRecord } from "../types.js";

export interface PendingCandidate {
  agentId: string;
  agentName?: string;
  candidate: PromoteCandidate;
  validation: ValidationResult;
}

/**
 * Read the per-agent CLAUDE.md for each agent and surface every well-formed
 * promote-candidate block. Skips agents whose CLAUDE.md is missing (not
 * yet forked) or unreadable.
 */
export async function collectPendingCandidates(
  agents: AgentRecord[],
): Promise<PendingCandidate[]> {
  const out: PendingCandidate[] = [];
  for (const agent of agents) {
    let md: string;
    try {
      md = await fs.readFile(agentClaudeMdPath(agent.agentId), "utf-8");
    } catch {
      continue;
    }
    const candidates = findPromoteCandidates(md);
    for (const candidate of candidates) {
      out.push({
        agentId: agent.agentId,
        agentName: agent.name,
        candidate,
        validation: validateEntry(candidate.body),
      });
    }
  }
  return out;
}

export interface AcceptResult {
  /** Set when domain is a regular shared-pool target (existing path). */
  appendOutcome?: AppendLessonOutcome;
  /** Set when domain is `@local-claude` (queue-file path; new in #194 follow-up). */
  localQueueOutcome?: AppendLocalClaudeQueueOutcome;
  /** True only when the source CLAUDE.md was rewritten — i.e. the entry was
   * appended/queued successfully AND the marker was rewritten. */
  rewroteSource: boolean;
}

/**
 * Append the candidate body to its target pool and rewrite the source
 * CLAUDE.md so the marker won't resurface. The two writes are NOT atomic
 * across files — if the pool append succeeds and the source rewrite fails,
 * the second `vp-dev lessons review` run will still find the same candidate
 * and the human can rerun it (the pool gets a duplicate entry; this is
 * acceptable: humans resolve duplicates by editing the pool by hand). The
 * inverse failure (rewrite without append) is impossible because we only
 * touch the source after the pool append commits.
 *
 * For `@local-claude` domain (#179 Phase 2 follow-up to PR #190 + #193): the
 * write goes to `state/local-claude-md-pending.md` (queue file) instead of
 * the shared-pool. Operator reads the queue, opens a chore PR appending
 * selected sections to project-local CLAUDE.md by hand. `tier` is ignored
 * for this branch.
 */
export async function acceptCandidate(input: {
  pending: PendingCandidate;
  /**
   * Destination tier for the accepted entry. "target" appends to
   * `agents/.shared/lessons/<domain>.md`; "global" appends to the
   * cross-target-repo pool under `~/.vaultpilot/shared-lessons/<domain>.md`.
   * Ignored when `pending.candidate.domain === "@local-claude"` — that path
   * routes to the local-CLAUDE.md queue file regardless of tier (#101).
   */
  tier: LessonTier;
  ts?: string;
  issueId?: number;
  /** Optional L2 gate result captured at accept time, recorded in the queue header. */
  localGate?: LocalClaudeUtilityGateResult;
}): Promise<AcceptResult> {
  const ts = input.ts ?? new Date().toISOString();
  const candidate = input.pending.candidate;

  if (isLocalClaudeCandidate(candidate.domain)) {
    const localQueueOutcome = await appendToLocalClaudeQueue({
      sourceAgentId: input.pending.agentId,
      ts,
      utility: candidate.utility,
      gate: input.localGate,
      body: candidate.body,
    });
    await rewriteSourceMarker({
      agentId: input.pending.agentId,
      candidate,
      replacement: formatPromotedSentinel(candidate.domain, ts),
    });
    return { localQueueOutcome, rewroteSource: true };
  }

  const appendOutcome = await appendLessonToPool({
    tier: input.tier,
    domain: candidate.domain,
    body: candidate.body,
    sourceAgentId: input.pending.agentId,
    issueId: input.issueId ?? 0,
    ts,
  });
  if (appendOutcome.kind !== "appended") {
    return { appendOutcome, rewroteSource: false };
  }
  await rewriteSourceMarker({
    agentId: input.pending.agentId,
    candidate,
    replacement: formatPromotedSentinel(candidate.domain, ts),
  });
  return { appendOutcome, rewroteSource: true };
}

export async function rejectCandidate(input: {
  pending: PendingCandidate;
  reason: string;
  ts?: string;
}): Promise<void> {
  const ts = input.ts ?? new Date().toISOString();
  await rewriteSourceMarker({
    agentId: input.pending.agentId,
    candidate: input.pending.candidate,
    replacement: formatNotPromotedSentinel(input.reason, ts),
  });
}

/**
 * Read the per-agent CLAUDE.md, replace the promote-candidate wrapping with
 * `replacement`, write back atomically. Held under the same per-file lock
 * as `appendBlock` (`agentClaudeMdPath(agentId).lock`) so the rewrite is
 * serialized against any concurrent summarizer-driven append.
 *
 * Re-locates the candidate from a fresh read in case the file shifted
 * between collect time and accept time (another agent run may have
 * appended a new section). If the marker is no longer present at the
 * recorded line range (e.g. another reviewer accepted it first), the
 * rewrite is a no-op.
 */
async function rewriteSourceMarker(input: {
  agentId: string;
  candidate: PromoteCandidate;
  replacement: string;
}): Promise<void> {
  const filePath = agentClaudeMdPath(input.agentId);
  await withFileLock(filePath, async () => {
    let current: string;
    try {
      current = await fs.readFile(filePath, "utf-8");
    } catch {
      return;
    }
    const fresh = findPromoteCandidates(current);
    const match = fresh.find(
      (c) =>
        c.domain === input.candidate.domain &&
        c.body === input.candidate.body,
    );
    if (!match) return;
    const next = rewriteCandidateWrapping(current, match, input.replacement);
    const tmp = `${filePath}.tmp.${process.pid}`;
    await fs.writeFile(tmp, next);
    await fs.rename(tmp, filePath);
  });
}
