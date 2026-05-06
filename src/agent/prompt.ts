import { promises as fs } from "node:fs";
import * as path from "node:path";
import { readAgentClaudeMd, readSeedClaudeMd } from "./specialization.js";
import { readSharedLessonsForDomains } from "./sharedLessons.js";
import { renderWorkflow, type WorkflowVars } from "./workflow.js";
import type { AgentRecord, ResumeContext } from "../types.js";

export async function buildAgentSystemPrompt(opts: {
  agent: AgentRecord;
  workflow: WorkflowVars;
  targetRepoPath: string;
  /**
   * Issue #119 Phase 2: when set, render a "## Previous attempt (resumed)"
   * section immediately before the workflow so the agent knows the
   * worktree's HEAD is not `origin/main` — it's a salvaged branch from a
   * prior attempt, rebased onto the current main. The agent should `git
   * log --oneline origin/main..HEAD` and build on the existing commits
   * rather than re-deriving the file layout from scratch.
   */
  resumeContext?: ResumeContext;
  /**
   * Issue #179 phase 3: when `true`, suppress the live target-repo
   * CLAUDE.md prepend. Used for the curve-study calibration so the
   * effective context size matches the per-agent CLAUDE.md size we're
   * varying (without this flag the live target-repo CLAUDE.md adds ~14 KB
   * of project rules to every dispatch, distorting the size axis).
   * The dedupe pass becomes a no-op when liveProjectClaudeMd is empty,
   * so the per-agent CLAUDE.md is emitted verbatim.
   */
  suppressTargetClaudeMd?: boolean;
}): Promise<string> {
  const [perAgentClaudeMd, liveProjectClaudeMdRaw] = await Promise.all([
    readAgentClaudeMd(opts.agent.agentId, opts.targetRepoPath),
    readSeedClaudeMd(opts.targetRepoPath),
  ]);
  const liveProjectClaudeMd = opts.suppressTargetClaudeMd ? "" : liveProjectClaudeMdRaw;
  const dedupedPerAgent = stripOverlappingSections(perAgentClaudeMd, liveProjectClaudeMd);

  const workflow = renderWorkflow(opts.workflow);

  const label = opts.agent.name
    ? `${opts.agent.name} [${opts.agent.agentId}]`
    : opts.agent.agentId;

  const plan = await readPlanFileForIssue({
    worktreePath: opts.workflow.worktreePath,
    issueId: opts.workflow.issueId,
  });

  // Cross-agent shared lessons. Pulled per-tier and matched against the
  // agent's current tag fingerprint. Each pool file is capped at
  // MAX_POOL_LINES so multi-tag agents stay bounded. Maintained by the
  // orchestrator via `vp-dev lessons review` (target tier, #33) and
  // `vp-dev lessons review --global` (cross-target-repo tier, #101); never
  // written by the coding agent — see the workflow guard in `workflow.ts`.
  //
  // Read order is global-first so per-target-repo lessons appear closer to
  // the workflow and dominate when a domain has content in both tiers
  // (later sections in the prompt are read more recently in context).
  const [globalLessons, targetLessons] = await Promise.all([
    readSharedLessonsForDomains("global", opts.agent.tags),
    readSharedLessonsForDomains("target", opts.agent.tags),
  ]);

  const sections: string[] = [];
  if (!opts.suppressTargetClaudeMd) {
    sections.push(
      "# Project rules (live target-repo CLAUDE.md — current as of this dispatch)",
      "",
      liveProjectClaudeMd.trim(),
      "",
      "---",
      "",
    );
  }
  sections.push(
    `# Per-agent CLAUDE.md (${label} — evolving specialization${opts.suppressTargetClaudeMd ? "" : ", sections overlapping live rules removed"})`,
    "",
    dedupedPerAgent.trim() || "(no agent-specific sections beyond live project rules)",
    "",
  );

  for (const pool of globalLessons) {
    sections.push(
      "---",
      "",
      `## Shared lessons (${pool.domain}, global)`,
      "",
      "Cross-target-repo observations curated by the orchestrator. Read-only — do NOT modify or copy back into your own CLAUDE.md.",
      "",
      pool.content.trim(),
      "",
    );
  }

  for (const pool of targetLessons) {
    sections.push(
      "---",
      "",
      `## Shared lessons (${pool.domain})`,
      "",
      "Cross-agent observations curated by the orchestrator (per-target-repo pool). Read-only — do NOT modify or copy back into your own CLAUDE.md.",
      "",
      pool.content.trim(),
      "",
    );
  }

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

  if (opts.resumeContext) {
    sections.push(
      "---",
      "",
      "## Previous attempt (resumed)",
      "",
      renderResumeBlock(opts.resumeContext),
      "",
    );
  }

  sections.push("---", "", workflow.trim());
  return sections.join("\n");
}

/**
 * Render the "## Previous attempt (resumed)" body. Pure (no I/O) so unit
 * tests can exercise the formatting independently. Truncates `finalText`
 * to 120 chars to keep the seed compact; missing optional fields drop the
 * relevant lines rather than printing `undefined`.
 *
 * Exported for unit testing.
 */
export function renderResumeBlock(ctx: ResumeContext): string {
  const lines: string[] = [];
  const failureMode = ctx.errorSubtype ?? "unknown";
  lines.push(
    `A prior agent (${ctx.agentId}, run ${ctx.runId}) made progress on this issue but did not finish — failure mode: ${failureMode}. Their in-flight commits were salvaged to a labeled \`*-incomplete-${ctx.runId}\` ref and rebased onto the current \`origin/main\`; that work is your starting commit.`,
  );
  lines.push("");
  lines.push("Verify with:");
  lines.push("  git log --oneline origin/main..HEAD");
  lines.push("");
  lines.push(
    "You may use `Read` and `Grep` to study the existing changes — that's faster than re-reading the issue and rediscovering the file layout. Build on the work; only revert when you find concrete bugs in it.",
  );
  if (ctx.finalText) {
    const trimmed = ctx.finalText.replace(/\s+/g, " ").trim().slice(0, 120);
    lines.push("");
    lines.push(`Last meaningful action recorded: ${trimmed}`);
  }
  if (ctx.partialBranchUrl) {
    lines.push("");
    lines.push(`Salvage branch: ${ctx.partialBranchUrl}`);
  }
  return lines.join("\n");
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
