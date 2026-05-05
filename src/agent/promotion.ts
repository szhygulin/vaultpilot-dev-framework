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
} from "./sharedLessons.js";
import { agentClaudeMdPath } from "./specialization.js";
import { withFileLock } from "../state/locks.js";
import {
  findPromoteCandidates,
  formatNotPromotedSentinel,
  formatPromotedSentinel,
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
  appendOutcome: AppendLessonOutcome;
  /** True only when the source CLAUDE.md was rewritten — i.e. the entry was
   * appended successfully AND the marker was rewritten. */
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
 */
export async function acceptCandidate(input: {
  pending: PendingCandidate;
  ts?: string;
  issueId?: number;
}): Promise<AcceptResult> {
  const ts = input.ts ?? new Date().toISOString();
  const appendOutcome = await appendLessonToPool({
    domain: input.pending.candidate.domain,
    body: input.pending.candidate.body,
    sourceAgentId: input.pending.agentId,
    issueId: input.issueId ?? 0,
    ts,
  });
  if (appendOutcome.kind !== "appended") {
    return { appendOutcome, rewroteSource: false };
  }
  await rewriteSourceMarker({
    agentId: input.pending.agentId,
    candidate: input.pending.candidate,
    replacement: formatPromotedSentinel(input.pending.candidate.domain, ts),
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
