// Auto-PR path for project-local CLAUDE.md candidates (#196 Phase 2).
//
// Creates a chore branch from a temp git worktree, appends the lesson body
// as a new section to project-local CLAUDE.md, commits, pushes, opens a PR
// via `gh pr create`. Operator-invoked through `vp-dev lessons review --pr`;
// runs in the operator's shell on their own machine.
//
// Project-rule note: the project CLAUDE.md says "Don't modify the target
// repo's CLAUDE.md from within a run." That rule covers IN-RUN side-effects
// from agent dispatches (where the LLM has tools and could write the file
// as a side-effect of its task). This module runs in the OPERATOR-INVOKED
// CLI flow — the operator explicitly opted in via `--pr` and (in
// interactive mode) confirmed each candidate. The L2 utility-vs-cost gate
// is the second checkpoint. The rule's "no automatic, unreviewed writes
// from within an LLM run" intent is preserved; this path is a different
// trust boundary.

import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { LocalClaudeUtilityGateResult } from "./localClaudeQueue.js";

const execFile = promisify(execFileCb);

export interface OpenLocalClaudePrInput {
  sourceAgentId: string;
  ts: string;
  utility?: number;
  gate?: LocalClaudeUtilityGateResult;
  /**
   * The wrapped block's body. Expected to start with a `## Heading` line
   * the operator wants in project-local CLAUDE.md, but no enforced shape —
   * we append verbatim with a single leading blank line.
   */
  body: string;
  /** Repo root the worktree branches off of. Defaults to cwd. */
  repoRoot?: string;
  /** Worktree base path (defaults to `<repoRoot>/.claude/worktrees`). */
  worktreesRoot?: string;
  /** Base branch for the chore branch. Defaults to `origin/main`. */
  baseRef?: string;
  /**
   * Override the PR creation step. Default shells out to `gh pr create`.
   * Tests pass a synthetic creator to assert the orchestration shape
   * without invoking real GitHub.
   */
  prCreator?: PrCreator;
}

export interface PrCreatorInput {
  branch: string;
  title: string;
  body: string;
  /** Working directory for the gh invocation (the worktree). */
  workdir: string;
}

export type PrCreator = (input: PrCreatorInput) => Promise<{ prUrl: string }>;

export type OpenLocalClaudePrOutcome =
  | { kind: "pr-opened"; prUrl: string; branchName: string }
  | { kind: "pr-failed"; reason: string; branchName?: string };

export const DEFAULT_BASE_REF = "origin/main";

/**
 * Append the lesson to project-local CLAUDE.md and open a PR. All work
 * happens in a temp worktree so the operator's main checkout isn't dirtied.
 *
 * Failure modes (each returns `{kind: "pr-failed", reason}`):
 *   - worktree creation fails (path collision, no git, etc.)
 *   - push rejected (auth, branch already on remote, etc.)
 *   - gh pr create fails (auth, no remote, gh missing)
 *
 * On any failure the worktree is removed, but the chore branch may persist
 * locally. Caller should fall back to the queue-file path so the lesson
 * isn't lost.
 */
export async function openLocalClaudePr(
  input: OpenLocalClaudePrInput,
): Promise<OpenLocalClaudePrOutcome> {
  const repoRoot = input.repoRoot ?? process.cwd();
  const worktreesRoot =
    input.worktreesRoot ?? path.join(repoRoot, ".claude", "worktrees");
  const baseRef = input.baseRef ?? DEFAULT_BASE_REF;
  const branchName = mintBranchName(input.sourceAgentId, input.ts);
  const worktreePath = path.join(worktreesRoot, branchName);
  const prCreator = input.prCreator ?? defaultPrCreator;

  // 1. Create the worktree off baseRef.
  try {
    await execFile(
      "git",
      ["worktree", "add", worktreePath, "-b", branchName, baseRef],
      { cwd: repoRoot },
    );
  } catch (err) {
    return { kind: "pr-failed", reason: `worktree-add: ${(err as Error).message}` };
  }

  try {
    // 2. Append the lesson to <worktree>/CLAUDE.md.
    const claudeMdPath = path.join(worktreePath, "CLAUDE.md");
    let current = "";
    try {
      current = await fs.readFile(claudeMdPath, "utf-8");
    } catch {
      // No file yet — create it.
    }
    const block = formatLessonAppend(input);
    const next =
      current.length === 0 || current.endsWith("\n")
        ? current + block
        : current + "\n" + block;
    await fs.writeFile(claudeMdPath, next);

    // 3. Commit.
    const commitMsg = formatCommitMessage(input);
    await execFile("git", ["add", "CLAUDE.md"], { cwd: worktreePath });
    await execFile("git", ["commit", "-m", commitMsg], { cwd: worktreePath });

    // 4. Push.
    try {
      await execFile(
        "git",
        ["push", "-u", "origin", branchName],
        { cwd: worktreePath },
      );
    } catch (err) {
      return {
        kind: "pr-failed",
        reason: `push: ${(err as Error).message}`,
        branchName,
      };
    }

    // 5. Open the PR.
    const { title, body } = formatPrTitleAndBody(input, commitMsg);
    let prResult: { prUrl: string };
    try {
      prResult = await prCreator({
        branch: branchName,
        title,
        body,
        workdir: worktreePath,
      });
    } catch (err) {
      return {
        kind: "pr-failed",
        reason: `gh-pr-create: ${(err as Error).message}`,
        branchName,
      };
    }

    return { kind: "pr-opened", prUrl: prResult.prUrl, branchName };
  } finally {
    // 6. Always remove the worktree to keep operator's tree clean. Branch
    // stays — push already published it.
    try {
      await execFile(
        "git",
        ["worktree", "remove", "--force", worktreePath],
        { cwd: repoRoot },
      );
    } catch {
      // Best-effort cleanup; if it fails, operator can `git worktree prune`.
    }
  }
}

function mintBranchName(sourceAgentId: string, ts: string): string {
  // Sanitize agent id (already shape `agent-...`) and timestamp.
  const agentSafe = sourceAgentId.replace(/[^a-zA-Z0-9-]/g, "-");
  const tsSafe = ts.replace(/[:.]/g, "-").replace(/[^a-zA-Z0-9-]/g, "-");
  return `chore/local-claude-from-${agentSafe}-${tsSafe}`;
}

function formatLessonAppend(input: OpenLocalClaudePrInput): string {
  const provenance: string[] = [
    `source=${input.sourceAgentId}`,
    `ts=${input.ts}`,
  ];
  if (input.utility !== undefined && Number.isFinite(input.utility)) {
    provenance.push(`utility=${input.utility}`);
  }
  if (input.gate) {
    provenance.push(`gate=${input.gate.decision}`);
  }
  const header = `<!-- promoted-from-summarizer ${provenance.join(" ")} -->`;
  return `\n${header}\n${input.body.trim()}\n`;
}

function formatCommitMessage(input: OpenLocalClaudePrInput): string {
  const headingMatch = input.body.match(/^##\s+(.+)$/m);
  const subject = headingMatch
    ? `docs(CLAUDE.md): ${headingMatch[1].trim()}`
    : `docs(CLAUDE.md): promoted local-claude lesson from ${input.sourceAgentId}`;
  return [
    subject.slice(0, 70),
    "",
    `Promoted from ${input.sourceAgentId}'s summarizer output via`,
    `vp-dev lessons review --pr (gate ${input.gate?.decision ?? "n/a"},`,
    `utility ${input.utility ?? "n/a"}, ratio ${input.gate?.ratio ?? "n/a"}).`,
    "",
    "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>",
  ].join("\n");
}

function formatPrTitleAndBody(
  input: OpenLocalClaudePrInput,
  commitMsg: string,
): { title: string; body: string } {
  const subject = commitMsg.split("\n")[0];
  const utilityLine =
    input.utility !== undefined ? `\n- predictedUtility: ${input.utility}` : "";
  const gateLine = input.gate
    ? `\n- L2 gate: decision=${input.gate.decision}, costScore=${input.gate.costScore.toFixed(3)}, threshold=${input.gate.threshold.toFixed(3)}, ratio=${input.gate.ratio}`
    : "";
  const body = [
    "## Summary",
    "",
    `Promoting a project-wide lesson the summarizer flagged via \`<!-- promote-candidate:@local-claude -->\` and the operator-side L2 utility gate accepted.`,
    "",
    "## Provenance",
    `- source agent: \`${input.sourceAgentId}\``,
    `- timestamp: \`${input.ts}\``,
    utilityLine + gateLine,
    "",
    "🤖 Auto-PR via `vp-dev lessons review --pr`",
  ].join("\n");
  return { title: subject, body };
}

async function defaultPrCreator(input: PrCreatorInput): Promise<{ prUrl: string }> {
  const { stdout } = await execFile(
    "gh",
    ["pr", "create", "--title", input.title, "--body", input.body],
    { cwd: input.workdir },
  );
  // gh pr create prints the PR URL on stdout (last non-empty line).
  const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] ?? "";
  if (!/^https?:\/\/.+/.test(last)) {
    throw new Error(`unexpected gh pr create output: ${stdout}`);
  }
  return { prUrl: last };
}
