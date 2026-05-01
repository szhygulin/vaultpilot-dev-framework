import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";
import type { Logger } from "../log/logger.js";

const execFile = promisify(execFileCb);

export interface WorktreeHandle {
  path: string;
  branch: string;
}

// vp-dev branch shape: vp-dev/<agentId>/issue-<N>. Producer is createWorktree
// below (line "vp-dev/${opts.agentId}/issue-${opts.issueId}"). Keep these in
// sync — pruneStaleAgentBranches uses this to decode an `agent-<id>+issue-<N>`
// pair from a branch name.
const VP_DEV_BRANCH_PATTERN = "vp-dev/agent-*/issue-*";
const VP_DEV_BRANCH_RE = /^vp-dev\/(agent-[a-z0-9]+)\/issue-(\d+)$/;

export async function resolveTargetRepoPath(
  targetRepo: string,
  explicit?: string,
): Promise<string> {
  if (explicit) {
    const resolved = path.resolve(explicit);
    await fs.access(resolved);
    return resolved;
  }
  const name = targetRepo.split("/").pop() ?? targetRepo;
  const home = process.env.HOME ?? "/home";
  const conventional = path.resolve(home, "dev", name);
  await fs.access(conventional);
  return conventional;
}

export async function fetchOriginMain(repoPath: string): Promise<void> {
  await execFile("git", ["fetch", "origin", "main"], { cwd: repoPath });
}

export async function pruneWorktrees(repoPath: string): Promise<void> {
  await execFile("git", ["worktree", "prune"], { cwd: repoPath });
}

export async function createWorktree(opts: {
  repoPath: string;
  agentId: string;
  issueId: number;
}): Promise<WorktreeHandle> {
  const branch = `vp-dev/${opts.agentId}/issue-${opts.issueId}`;
  const wtPath = path.join(opts.repoPath, ".claude", "worktrees", `${opts.agentId}-issue-${opts.issueId}`);

  // CLAUDE.md: cd <repoPath> BEFORE worktree add — execFile with cwd does that explicitly.
  await execFile("git", ["fetch", "origin", "main"], { cwd: opts.repoPath });
  try {
    await execFile(
      "git",
      ["worktree", "add", path.join(".claude", "worktrees", `${opts.agentId}-issue-${opts.issueId}`), "-b", branch, "origin/main"],
      { cwd: opts.repoPath },
    );
  } catch (err) {
    const msg = (err as { stderr?: string }).stderr ?? String(err);
    throw new Error(`worktree add failed: ${msg}`);
  }
  return { path: wtPath, branch };
}

export async function removeWorktree(opts: {
  repoPath: string;
  worktree: WorktreeHandle;
  deleteBranch: boolean;
}): Promise<void> {
  try {
    await execFile("git", ["worktree", "remove", opts.worktree.path, "--force"], { cwd: opts.repoPath });
  } catch {
    // ignore — already removed or path missing
  }
  if (opts.deleteBranch) {
    try {
      await execFile("git", ["branch", "-D", opts.worktree.branch], { cwd: opts.repoPath });
    } catch {
      // ignore
    }
  }
}

export async function listWorktrees(repoPath: string): Promise<string[]> {
  try {
    const { stdout } = await execFile("git", ["worktree", "list", "--porcelain"], { cwd: repoPath });
    return stdout
      .split("\n")
      .filter((l) => l.startsWith("worktree "))
      .map((l) => l.slice("worktree ".length).trim());
  } catch {
    return [];
  }
}

// Sweep stale `vp-dev/agent-*/issue-*` branches whose PR is no longer open.
//
// After a successful "implement" run, runIssueCore intentionally retains the
// branch (deleteBranch: false) because the open PR's head depends on it.
// Once that PR merges or closes, the branch is dead weight — and worse,
// `git worktree add ... -b <branch>` collides on the next dispatch of the
// same (agent, issue) pair, throwing `error.agent.uncaught` and silently
// skipping the issue.
//
// Safety: only branches matching the vp-dev pattern are considered (no
// human-authored branch matches), and a branch is preserved if `gh pr list
// --head <branch> --state open` returns any rows. If `gh pr list` itself
// fails (network, auth), we keep the branch — fail-safe defaults.
//
// Push-protection invariant: all writes are local (`git branch -D`,
// `git worktree remove`). No `git push --delete`, no remote mutation.
export async function pruneStaleAgentBranches(
  repoPath: string,
  targetRepo: string,
  logger?: Logger,
): Promise<{ pruned: number; kept: number }> {
  let branches: string[] = [];
  try {
    const { stdout } = await execFile(
      "git",
      ["branch", "--list", VP_DEV_BRANCH_PATTERN, "--format=%(refname:short)"],
      { cwd: repoPath },
    );
    branches = stdout.trim().split("\n").filter(Boolean);
  } catch (err) {
    logger?.warn("worktree.stale_branches_list_failed", {
      err: (err as Error).message,
    });
    return { pruned: 0, kept: 0 };
  }
  if (branches.length === 0) return { pruned: 0, kept: 0 };

  let pruned = 0;
  let kept = 0;
  for (const branch of branches) {
    const m = VP_DEV_BRANCH_RE.exec(branch);
    if (!m) {
      kept++;
      continue;
    }
    const [, agentId, issueIdStr] = m;
    const issueId = parseInt(issueIdStr, 10);

    let prsOpen: number;
    try {
      const { stdout } = await execFile(
        "gh",
        ["pr", "list", "--repo", targetRepo, "--head", branch, "--state", "open", "--json", "number"],
        { cwd: repoPath },
      );
      const arr = JSON.parse(stdout) as unknown;
      prsOpen = Array.isArray(arr) ? arr.length : 0;
    } catch (err) {
      // Network/auth/unknown — fail-safe: keep the branch.
      kept++;
      logger?.info("worktree.stale_branch_kept", {
        branch,
        agentId,
        issueId,
        reason: `gh pr list failed: ${(err as { stderr?: string }).stderr ?? (err as Error).message}`,
      });
      continue;
    }

    if (prsOpen > 0) {
      kept++;
      logger?.info("worktree.stale_branch_kept", {
        branch,
        agentId,
        issueId,
        reason: `open PR exists (count=${prsOpen})`,
      });
      continue;
    }

    // No open PR — branch is stale. Delete it; remove any leftover worktree dir.
    const wtPath = path.join(repoPath, ".claude", "worktrees", `${agentId}-issue-${issueId}`);
    try {
      await fs.access(wtPath);
      await execFile("git", ["worktree", "remove", wtPath, "--force"], { cwd: repoPath });
    } catch {
      // No leftover dir, or remove already failed — branch delete proceeds.
    }
    try {
      await execFile("git", ["branch", "-D", branch], { cwd: repoPath });
      pruned++;
      logger?.info("worktree.stale_branch_pruned", { branch, agentId, issueId });
    } catch (err) {
      kept++;
      logger?.warn("worktree.stale_branch_delete_failed", {
        branch,
        err: (err as { stderr?: string }).stderr ?? (err as Error).message,
      });
    }
  }

  logger?.info("worktree.stale_branches_swept", { pruned, kept });
  return { pruned, kept };
}
