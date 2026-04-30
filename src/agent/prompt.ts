import path from "node:path";
import { promises as fs } from "node:fs";
import { buildMemoryFragment } from "../memory/format.js";
import { renderWorkflow, type WorkflowVars } from "./workflow.js";
import type { AgentRecord } from "../types.js";

const FRAMEWORK_REPO_ROOT = path.resolve(process.cwd());
const FRAMEWORK_CLAUDE_MD = path.join(FRAMEWORK_REPO_ROOT, "CLAUDE.md");

export async function buildAgentSystemPrompt(opts: {
  agent: AgentRecord;
  workflow: WorkflowVars;
}): Promise<string> {
  const claudeMd = await fs.readFile(FRAMEWORK_CLAUDE_MD, "utf-8");
  const memory = await buildMemoryFragment(opts.agent);
  const workflow = renderWorkflow(opts.workflow);

  return [
    "# CLAUDE.md (project guidance — verbatim)",
    "",
    claudeMd.trim(),
    "",
    "---",
    "",
    "# Agent memory",
    "",
    memory.trim(),
    "",
    "---",
    "",
    workflow.trim(),
  ].join("\n");
}
