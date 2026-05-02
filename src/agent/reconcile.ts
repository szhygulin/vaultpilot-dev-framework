import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import type { Logger } from "../log/logger.js";
import type { ResultEnvelope } from "../types.js";

const execFile = promisify(execFileCb);

export interface ReconcileInput {
  agentId: string;
  issueId: number;
  /** GitHub `owner/repo`. */
  targetRepo: string;
  /** Local clone of the target repo (worktree's host path). */
  targetRepoPath: string;
  /** `vp-dev/<agentId>/issue-<n>` per createWorktree convention. */
  branchName: string;
  /** The original `extractEnvelope` failure — preserved as a soft warning. */
  parseError: string;
  logger: Logger;
}

export type ReconcileState = "pr-found" | "branch-only" | "no-state" | "error";

export interface ReconcileResult {
  state: ReconcileState;
  /** Populated when state === "pr-found": a synthesized envelope to keep status integrity. */
  reconciledEnvelope?: ResultEnvelope;
  /** Populated when state ∈ {"pr-found", "branch-only"}. */
  branchUrl?: string;
  /** Populated when state === "pr-found". */
  prUrl?: string;
  /** Human-readable note for logs / orchestrator. */
  note: string;
}

/**
 * Rebuild a result envelope from git/gh state when extractEnvelope fails.
 *
 * Bounded by spec (#53 acceptance): exactly one `git ls-remote` and at most
 * one `gh pr list` per call, no polling. Cases:
 *
 *  - **pr-found** — branch on remote + open PR exists. Returns a synthesized
 *    envelope `{decision: "implement", prUrl, reason: "Reconciled from PR
 *    state ..."}`. The original parseError stays in CodingAgentResult so the
 *    bug remains visible.
 *  - **branch-only** — branch on remote, no open PR. Returns branchUrl so the
 *    orphan branch is grep-able from the run log; envelope stays undefined
 *    (caller treats as failure but with cleanup info attached). We do NOT
 *    auto-create the PR: a stub-bodied PR with no agent context is worse than
 *    a flagged orphan branch the user can salvage by hand in one command.
 *  - **no-state** — no branch on remote. Original parseError behavior preserved.
 *  - **error** — git or gh tooling itself failed. Original parseError behavior
 *    preserved; failure logged as a warning.
 */
export async function reconcileFromState(input: ReconcileInput): Promise<ReconcileResult> {
  // 1. Branch check — does the agent's expected branch exist on remote?
  let branchExists: boolean;
  try {
    const { stdout } = await execFile(
      "git",
      ["ls-remote", "--heads", "origin", input.branchName],
      { cwd: input.targetRepoPath },
    );
    branchExists = stdout.trim().length > 0;
  } catch (err) {
    input.logger.warn("agent.reconcile_git_failed", {
      agentId: input.agentId,
      issueId: input.issueId,
      branch: input.branchName,
      err: errMessage(err),
    });
    return { state: "error", note: "git ls-remote failed; preserving parseError." };
  }

  if (!branchExists) {
    return { state: "no-state", note: "No branch on remote; preserving parseError." };
  }

  const branchUrl = `https://github.com/${input.targetRepo}/tree/${encodeURIComponent(
    input.branchName,
  )}`;

  // 2. PR check — open PR for this branch?
  let prUrl: string | undefined;
  try {
    const { stdout } = await execFile(
      "gh",
      [
        "pr",
        "list",
        "--repo",
        input.targetRepo,
        "--head",
        input.branchName,
        "--state",
        "open",
        "--json",
        "url",
      ],
      { cwd: input.targetRepoPath },
    );
    const arr = JSON.parse(stdout) as unknown;
    if (Array.isArray(arr) && arr.length > 0) {
      const first = arr[0] as { url?: unknown };
      if (typeof first.url === "string") prUrl = first.url;
    }
  } catch (err) {
    // Branch exists but PR check failed (network/auth/etc). Surface as
    // branch-only so the user gets the branchUrl and can verify by hand.
    input.logger.warn("agent.reconcile_gh_failed", {
      agentId: input.agentId,
      issueId: input.issueId,
      branch: input.branchName,
      err: errMessage(err),
    });
    return {
      state: "branch-only",
      branchUrl,
      note: `gh pr list failed; branch exists at ${branchUrl}. Verify with: gh pr list --repo ${input.targetRepo} --head ${input.branchName}`,
    };
  }

  if (prUrl) {
    const reconciledEnvelope: ResultEnvelope = {
      decision: "implement",
      reason: `Reconciled from PR state (parser failed: ${truncate(input.parseError, 200)})`,
      prUrl,
      memoryUpdate: { addTags: [] },
    };
    input.logger.info("agent.reconciled", {
      agentId: input.agentId,
      issueId: input.issueId,
      branch: input.branchName,
      prUrl,
      parseError: truncate(input.parseError, 200),
    });
    return {
      state: "pr-found",
      reconciledEnvelope,
      prUrl,
      branchUrl,
      note: "Reconciled to implement decision from open PR.",
    };
  }

  // Branch exists, no open PR — orphan. Don't auto-create: a stub PR with no
  // agent context is worse than a flagged orphan the user can salvage with
  // one `gh pr create` command. Surface branchUrl in a structured warn log so
  // it's grep-able from the run JSONL.
  const salvageHint = `gh pr create --repo ${input.targetRepo} --base main --head ${input.branchName} --title "<title>" --body "Closes #${input.issueId}"`;
  input.logger.warn("agent.reconcile_orphan_branch", {
    agentId: input.agentId,
    issueId: input.issueId,
    branch: input.branchName,
    branchUrl,
    salvageHint,
    parseError: truncate(input.parseError, 200),
  });
  return {
    state: "branch-only",
    branchUrl,
    note: `Branch pushed without PR. Salvage: ${salvageHint}`,
  };
}

function errMessage(err: unknown): string {
  const e = err as { stderr?: string; message?: string };
  return e.stderr ?? e.message ?? String(err);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 3) + "..." : s;
}
