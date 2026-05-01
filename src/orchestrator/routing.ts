import type { AgentRecord, IssueSummary } from "../types.js";

export interface ScoredPair {
  agentId: string;
  issueId: number;
  score: number;
}

// Jaccard floor that promotes an agent from "weak" to "specialist" for an
// issue. Hand-tuned: at 0.25, an issue with 4 labels needs an agent whose
// tag set overlaps on at least 1 of them while the union stays compact —
// the natural threshold for a "fits the topic" signal.
export const SPECIALIST_THRESHOLD = 0.25;

// Two-phase routing is opt-in for now to allow shadow comparison against the
// legacy single-Jaccard-sort. Flip default when confidence is high.
export function isTwoPhaseRoutingEnabled(): boolean {
  return process.env.VP_DEV_TWO_PHASE_ROUTING === "1";
}

export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const setA = new Set(toLowerSet(a));
  const setB = new Set(toLowerSet(b));
  if (setA.size === 0 && setB.size === 0) return 0;
  let inter = 0;
  for (const v of setA) if (setB.has(v)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

function toLowerSet(it: Iterable<string>): string[] {
  const out: string[] = [];
  for (const v of it) out.push(v.toLowerCase());
  return out;
}

export function scoreAgentIssue(agent: AgentRecord, issue: IssueSummary): number {
  const j = jaccard(agent.tags, issue.labels);
  return j + 0.05 * Math.log(1 + agent.issuesHandled);
}

export type MatchClass = "specialist" | "weak" | "miss";

export function classifyMatch(agent: AgentRecord, issue: IssueSummary): MatchClass {
  const j = jaccard(agent.tags, issue.labels);
  if (j >= SPECIALIST_THRESHOLD) return "specialist";
  if (j > 0) return "weak";
  return "miss";
}

/** True if an agent has not yet drifted into a specialty. */
export function isGeneralist(agent: AgentRecord): boolean {
  if (agent.tags.length === 0) return true;
  if (agent.tags.length === 1 && agent.tags[0].toLowerCase() === "general") return true;
  // Allow a small tag set with "general" present — accumulates a few tags
  // before the agent is considered specialized.
  const hasGeneral = agent.tags.some((t) => t.toLowerCase() === "general");
  return hasGeneral && agent.tags.length <= 3;
}

export interface TwoPhasePickInput {
  idleAgents: AgentRecord[];
  pendingIssues: IssueSummary[];
  cap: number;
}

export interface TwoPhasePickResult {
  assignments: ScoredPair[];
  unmatchedIssueIds: number[];
  reasons: Array<{
    issueId: number;
    agentId: string;
    phase: "specialist" | "general";
    score: number;
  }>;
}

/**
 * Two-phase picker:
 *
 *  Phase A (specialist): for each issue, find idle agents with Jaccard ≥
 *  SPECIALIST_THRESHOLD. Greedy match highest-scoring (score, agentId,
 *  issueId) pair first; don't double-book an agent.
 *
 *  Phase B (general fallback): unmatched issues route to a generalist
 *  (agent with `general` tag and ≤3 total tags). Tiebreak on
 *  least-recently-active to spread load — opposite of the legacy
 *  `0.05*log(issuesHandled)` bonus that pushed work toward the busiest
 *  agent.
 */
export function twoPhasePick(input: TwoPhasePickInput): TwoPhasePickResult {
  const cap = Math.min(input.cap, input.idleAgents.length, input.pendingIssues.length);
  const assignments: ScoredPair[] = [];
  const reasons: TwoPhasePickResult["reasons"] = [];
  if (cap <= 0) {
    return { assignments, unmatchedIssueIds: input.pendingIssues.map((i) => i.id), reasons };
  }

  const usedAgents = new Set<string>();
  const usedIssues = new Set<number>();

  // Phase A: collect specialist pairs and sort.
  const specialistPairs: ScoredPair[] = [];
  for (const a of input.idleAgents) {
    for (const i of input.pendingIssues) {
      if (classifyMatch(a, i) === "specialist") {
        specialistPairs.push({
          agentId: a.agentId,
          issueId: i.id,
          score: scoreAgentIssue(a, i),
        });
      }
    }
  }
  specialistPairs.sort(
    (p, q) => q.score - p.score || p.agentId.localeCompare(q.agentId) || p.issueId - q.issueId,
  );
  for (const p of specialistPairs) {
    if (assignments.length >= cap) break;
    if (usedAgents.has(p.agentId) || usedIssues.has(p.issueId)) continue;
    assignments.push(p);
    usedAgents.add(p.agentId);
    usedIssues.add(p.issueId);
    reasons.push({ issueId: p.issueId, agentId: p.agentId, phase: "specialist", score: p.score });
  }

  // Phase B: route remaining issues to generalists.
  if (assignments.length < cap) {
    const generalists = input.idleAgents
      .filter((a) => !usedAgents.has(a.agentId) && isGeneralist(a))
      .sort((x, y) => Date.parse(x.lastActiveAt) - Date.parse(y.lastActiveAt));
    for (const i of input.pendingIssues) {
      if (assignments.length >= cap) break;
      if (usedIssues.has(i.id)) continue;
      const next = generalists.find((g) => !usedAgents.has(g.agentId));
      if (!next) break;
      const score = scoreAgentIssue(next, i);
      assignments.push({ agentId: next.agentId, issueId: i.id, score });
      usedAgents.add(next.agentId);
      usedIssues.add(i.id);
      reasons.push({ issueId: i.id, agentId: next.agentId, phase: "general", score });
    }
  }

  const unmatchedIssueIds = input.pendingIssues
    .map((i) => i.id)
    .filter((id) => !usedIssues.has(id));
  return { assignments, unmatchedIssueIds, reasons };
}

export interface FallbackInput {
  idleAgents: AgentRecord[];
  pendingIssues: IssueSummary[];
  cap: number;
}

export interface FallbackAssignment {
  agentId: string;
  issueId: number;
}

export function deterministicFallback(input: FallbackInput): FallbackAssignment[] {
  if (isTwoPhaseRoutingEnabled()) {
    return twoPhasePick(input).assignments.map(({ agentId, issueId }) => ({ agentId, issueId }));
  }
  const cap = Math.min(input.cap, input.idleAgents.length, input.pendingIssues.length);
  if (cap <= 0) return [];

  const pairs: ScoredPair[] = [];
  for (const a of input.idleAgents) {
    for (const i of input.pendingIssues) {
      pairs.push({ agentId: a.agentId, issueId: i.id, score: scoreAgentIssue(a, i) });
    }
  }
  pairs.sort((p, q) => q.score - p.score || p.agentId.localeCompare(q.agentId) || p.issueId - q.issueId);

  const usedAgents = new Set<string>();
  const usedIssues = new Set<number>();
  const out: FallbackAssignment[] = [];
  for (const p of pairs) {
    if (out.length >= cap) break;
    if (usedAgents.has(p.agentId) || usedIssues.has(p.issueId)) continue;
    out.push({ agentId: p.agentId, issueId: p.issueId });
    usedAgents.add(p.agentId);
    usedIssues.add(p.issueId);
  }
  return out;
}
