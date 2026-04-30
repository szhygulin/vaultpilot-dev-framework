import type { AgentRecord, IssueSummary } from "../types.js";

export interface ScoredPair {
  agentId: string;
  issueId: number;
  score: number;
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
