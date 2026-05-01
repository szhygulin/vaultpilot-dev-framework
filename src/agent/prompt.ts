import { readAgentClaudeMd } from "./specialization.js";
import { renderWorkflow, type WorkflowVars } from "./workflow.js";
import type { AgentRecord } from "../types.js";

export async function buildAgentSystemPrompt(opts: {
  agent: AgentRecord;
  workflow: WorkflowVars;
  targetRepoPath: string;
}): Promise<string> {
  const claudeMd = await readAgentClaudeMd(opts.agent.agentId, opts.targetRepoPath);
  const workflow = renderWorkflow(opts.workflow);

  const label = opts.agent.name
    ? `${opts.agent.name} [${opts.agent.agentId}]`
    : opts.agent.agentId;
  return [
    `# CLAUDE.md (agent ${label} — evolving specialization)`,
    "",
    claudeMd.trim(),
    "",
    "---",
    "",
    workflow.trim(),
  ].join("\n");
}
