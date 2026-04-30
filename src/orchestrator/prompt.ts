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

  return `You are the dispatcher for vp-dev. You assign idle agents to pending issues for ONE scheduling tick.

Routing rule:
- Prefer specialists by Jaccard overlap between agent.tags and issue.labels.
- Brand-new general agents (tags == ["general"]) should pick up issues with no obvious specialist match.
- Each agent gets at most ONE issue per tick. Each issue is assigned to at most ONE agent.
- Emit at most ${input.cap} assignments.

Inputs (JSON):
${JSON.stringify({ pending, idle, cap: input.cap }, null, 2)}${errorBlock}

Output ONLY valid JSON in this exact shape, no prose, no markdown:
{"assignments":[{"agentId":"<id>","issueId":<number>}, ...]}

If no productive assignments are available, emit {"assignments":[]}.`;
}
