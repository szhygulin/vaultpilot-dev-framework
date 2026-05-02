import { promises as fs } from "node:fs";
import * as path from "node:path";
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

  const plan = await readPlanFileForIssue({
    worktreePath: opts.workflow.worktreePath,
    issueId: opts.workflow.issueId,
  });

  const sections: string[] = [
    `# CLAUDE.md (agent ${label} — evolving specialization)`,
    "",
    claudeMd.trim(),
    "",
  ];

  if (plan) {
    sections.push(
      "---",
      "",
      `# Plan for issue #${opts.workflow.issueId} (from feature-plans/${plan.filename})`,
      "",
      "This plan was prepared in advance for this issue. Treat it as authoritative design guidance — read it before deciding pushback vs implement, and prefer its file-by-file layout over reinventing one. Push back if the plan is wrong on contact with code; otherwise follow it.",
      "",
      plan.content.trim(),
      "",
    );
  }

  sections.push("---", "", workflow.trim());
  return sections.join("\n");
}

/**
 * Look for a plan file matching the convention `feature-plans/issue-<N>-*.md`
 * inside the agent's worktree. The worktree is always a checkout of the
 * target repo, so any committed plan file at this path is available without
 * a network call. Returns null if no plan file exists — equivalent to the
 * "Not needed" sentinel from the issue-body convention; the agent simply
 * reads the issue body for itself in that case.
 */
async function readPlanFileForIssue(opts: {
  worktreePath: string;
  issueId: number;
}): Promise<{ filename: string; content: string } | null> {
  const dir = path.join(opts.worktreePath, "feature-plans");
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return null;
  }
  const prefix = `issue-${opts.issueId}-`;
  const matches = entries
    .filter((e) => e.startsWith(prefix) && e.endsWith(".md"))
    .sort();
  if (matches.length === 0) return null;
  const filename = matches[0];
  try {
    const content = await fs.readFile(path.join(dir, filename), "utf8");
    return { filename, content };
  } catch {
    return null;
  }
}
