import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";

const execFile = promisify(execFileCb);

export interface WorktreeHandle {
  path: string;
  branch: string;
}

export async function targetRepoPath(targetRepo: string): Promise<string> {
  // Convention from CLAUDE.md: target repo lives at /home/szhygulin/dev/<name>
  const name = targetRepo.split("/").pop() ?? targetRepo;
  const candidate = path.resolve("/home/szhygulin/dev", name);
  await fs.access(candidate);
  return candidate;
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
