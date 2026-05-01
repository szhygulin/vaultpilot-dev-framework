import { isTwoPhaseRoutingEnabled, SPECIALIST_THRESHOLD } from "./routing.js";
import type { AgentRecord, IssueSummary } from "../types.js";

export interface TickPromptInput {
  pendingIssues: IssueSummary[];
  idleAgents: AgentRecord[];
  cap: number;
  errorsFromPrior?: string[];
}

export function buildTickPrompt(input: TickPromptInput): string {
  const pending = input.pendingIssues.map((i) => ({
    id: i.id,
    title: i.title,
    labels: i.labels,
  }));
  const idle = input.idleAgents.map((a) => ({
    agentId: a.agentId,
    tags: a.tags,
    issuesHandled: a.issuesHandled,
  }));

  const errorBlock = input.errorsFromPrior?.length
    ? `\n\nYour PRIOR proposal failed validation. Fix these and re-emit:\n${input.errorsFromPrior.map((e) => `- ${e}`).join("\n")}\n`
    : "";

  const routingRule = isTwoPhaseRoutingEnabled()
    ? `Routing rule (two-phase):
- Phase A — specialists first. For each issue, prefer an agent whose tags overlap the issue's labels with Jaccard >= ${SPECIALIST_THRESHOLD}. Pick the highest-scoring agent x issue pair first; don't double-book a specialist if another also fits.
- Phase B — fall back to a general agent (tags includes "general", <=3 tags total). General agents pick up issues with no specialist match.
- Each agent gets at most ONE issue per tick. Each issue is assigned to at most ONE agent.
- Emit AT MOST ${input.cap} assignment${input.cap === 1 ? "" : "s"}. Leaving slots empty is acceptable when no specialist OR general agent fits the remaining issues. If a specialist OR general agent IS available for an unmatched issue, you must assign it.`
    : `Routing rule:
- Prefer specialists by Jaccard overlap between agent.tags and issue.labels.
- Brand-new general agents (tags == ["general"]) should pick up issues with no obvious specialist match.
- Each agent gets at most ONE issue per tick. Each issue is assigned to at most ONE agent.
- Emit EXACTLY ${input.cap} assignment${input.cap === 1 ? "" : "s"}. The cap reflects how many idle-agent x pending-issue pairs are available — leaving slots empty wastes parallelism. If the routing fit is weak, still assign — Jaccard overlap of 0 is acceptable when no better match exists.`;

  return `You are the dispatcher for vp-dev. You assign idle agents to pending issues for ONE scheduling tick.

${routingRule}

Inputs (JSON):
${JSON.stringify({ pending, idle, cap: input.cap }, null, 2)}${errorBlock}

Output ONLY valid JSON in this exact shape, no prose, no markdown:
{"assignments":[{"agentId":"<id>","issueId":<number>}, ...]}`;
}
