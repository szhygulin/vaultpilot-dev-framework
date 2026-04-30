import { readAgentClaudeMd } from "./specialization.js";
import { renderWorkflow, type WorkflowVars } from "./workflow.js";
import type { AgentRecord } from "../types.js";

export async function buildAgentSystemPrompt(opts: {
  agent: AgentRecord;
  workflow: WorkflowVars;
}): Promise<string> {
  const claudeMd = await readAgentClaudeMd(opts.agent.agentId);
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
