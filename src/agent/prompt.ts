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

  return [
    `# CLAUDE.md (agent ${opts.agent.agentId} — evolving specialization)`,
    "",
    claudeMd.trim(),
    "",
    "---",
    "",
    workflow.trim(),
  ].join("\n");
}
