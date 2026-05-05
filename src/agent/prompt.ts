import { promises as fs } from "node:fs";
import * as path from "node:path";
import { readAgentClaudeMd, readSeedClaudeMd } from "./specialization.js";
import { renderWorkflow, type WorkflowVars } from "./workflow.js";
import type { AgentRecord } from "../types.js";

export async function buildAgentSystemPrompt(opts: {
  agent: AgentRecord;
  workflow: WorkflowVars;
  targetRepoPath: string;
}): Promise<string> {
  const [perAgentClaudeMd, liveProjectClaudeMd] = await Promise.all([
    readAgentClaudeMd(opts.agent.agentId, opts.targetRepoPath),
    readSeedClaudeMd(opts.targetRepoPath),
  ]);
  const dedupedPerAgent = stripOverlappingSections(perAgentClaudeMd, liveProjectClaudeMd);

  const workflow = renderWorkflow(opts.workflow);

  const label = opts.agent.name
    ? `${opts.agent.name} [${opts.agent.agentId}]`
    : opts.agent.agentId;

  const plan = await readPlanFileForIssue({
    worktreePath: opts.workflow.worktreePath,
    issueId: opts.workflow.issueId,
  });

  const sections: string[] = [
    "# Project rules (live target-repo CLAUDE.md — current as of this dispatch)",
    "",
    liveProjectClaudeMd.trim(),
    "",
    "---",
    "",
    `# Per-agent CLAUDE.md (${label} — evolving specialization, sections overlapping live rules removed)`,
    "",
    dedupedPerAgent.trim() || "(no agent-specific sections beyond live project rules)",
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
 * Drop any `## Heading` section in `perAgent` whose heading also appears in
 * `live`. Live wins — the per-agent copy is presumed stale (forked at
 * agent-mint time, possibly weeks ago). Heading match is case-insensitive
 * and whitespace-trimmed; section bodies are not compared, so a renamed-but-
 * substantively-same section won't be deduped (acceptable: the user can
 * rename to force a side-by-side view).
 *
 * Anything before the first `## ` in `perAgent` is preserved as preamble.
 */
export function stripOverlappingSections(perAgent: string, live: string): string {
  const liveHeadings = new Set(
    extractH2Headings(live).map((h) => h.trim().toLowerCase()),
  );
  if (liveHeadings.size === 0) return perAgent;

  const lines = perAgent.split("\n");
  const out: string[] = [];
  let dropping = false;
  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      const heading = m[1].trim().toLowerCase();
      dropping = liveHeadings.has(heading);
      if (dropping) continue;
    }
    if (!dropping) out.push(line);
  }
  return out.join("\n");
}

function extractH2Headings(md: string): string[] {
  const out: string[] = [];
  for (const line of md.split("\n")) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
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
