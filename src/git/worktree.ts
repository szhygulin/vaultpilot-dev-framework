import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";
import type { Logger } from "../log/logger.js";
import type { UnprunableStaleBranch } from "../types.js";

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

// Per-target-repo serialization for `git worktree add`.
//
// `git worktree add` writes upstream-tracking config into the target repo's
// `.git/config` during creation. Two parallel adds against the SAME repo race
// on the lock file `.git/config.lock` and one fails with `error: could not
// lock config file .git/config: File exists`. Observed 2026-05-01 in a
// 5-agent dry run on issue #608 — the failure surfaced as
// `error.agent.uncaught` and the issue was silently dropped.
//
// Different target repos have independent `.git/config` files, so we key on
// repoPath and let cross-repo adds run in parallel.
//
// The map stores each caller's "tail" promise (resolves when its fn
// completes). The next caller awaits the prior tail, so the chain serializes
// per-key. Cleanup checks `Map.get(key) === tail` and drops the entry if no
// later caller has chained on — keeps the map from leaking across many runs.
const worktreeAddLocks = new Map<string, Promise<void>>();

async function withRepoLock<T>(
  repoPath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prior = worktreeAddLocks.get(repoPath) ?? Promise.resolve();
  let release!: () => void;
  const tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  worktreeAddLocks.set(repoPath, tail);
  try {
    await prior;
    return await fn();
  } finally {
    release();
    if (worktreeAddLocks.get(repoPath) === tail) {
      worktreeAddLocks.delete(repoPath);
    }
  }
}

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
  /**
   * Issue #119 Phase 2: when set, branch the new worktree off the named
   * salvage ref on origin (a `vp-dev/agent-X/issue-N-incomplete-<runId>`
   * branch produced by the safety net) and rebase onto `origin/main`. The
   * resulting worktree has the originating agent's commits as its starting
   * point, brought current with whatever has merged into main since.
   *
   * On rebase conflict the helper aborts the rebase and throws a structured
   * error; callers surface that into the run-state JSON via the same audit
   * trail used by `unprunableStaleBranches`. Phase 2 does NOT attempt to
   * resolve conflicts automatically — the operator decides whether to
   * salvage manually or re-dispatch from main.
   */
  resumeFromBranch?: string;
}): Promise<WorktreeHandle> {
  const branch = `vp-dev/${opts.agentId}/issue-${opts.issueId}`;
  const wtPath = path.join(opts.repoPath, ".claude", "worktrees", `${opts.agentId}-issue-${opts.issueId}`);
  const wtRel = path.join(".claude", "worktrees", `${opts.agentId}-issue-${opts.issueId}`);

  // CLAUDE.md: cd <repoPath> BEFORE worktree add — execFile with cwd does that explicitly.
  await execFile("git", ["fetch", "origin", "main"], { cwd: opts.repoPath });

  // When resuming from a salvage ref, fetch that specific branch into the
  // local remote-tracking namespace so `git worktree add ... <ref>` can
  // resolve it. The salvage ref was pushed by `pushPartialBranch` on a
  // prior run; this clone may have never seen it. Failure here aborts
  // before any worktree is created — the caller treats the throw as
  // "salvage branch unavailable" and the run-state surfaces it.
  if (opts.resumeFromBranch) {
    try {
      await execFile(
        "git",
        [
          "fetch",
          "origin",
          `${opts.resumeFromBranch}:refs/remotes/origin/${opts.resumeFromBranch}`,
        ],
        { cwd: opts.repoPath },
      );
    } catch (err) {
      const msg = (err as { stderr?: string }).stderr ?? String(err);
      throw new Error(
        `resume fetch failed for ${opts.resumeFromBranch}: ${msg}`,
      );
    }
  }

  // Serialize the worktree-add against this target repo to avoid the
  // `.git/config` lock race when multiple agents spawn in the same tick
  // (see worktreeAddLocks comment above). Fetch is read-mostly and runs
  // outside the lock to maximize parallelism.
  const baseRef = opts.resumeFromBranch
    ? `refs/remotes/origin/${opts.resumeFromBranch}`
    : "origin/main";
  try {
    await withRepoLock(opts.repoPath, () =>
      execFile(
        "git",
        ["worktree", "add", wtRel, "-b", branch, baseRef],
        { cwd: opts.repoPath },
      ),
    );
  } catch (err) {
    const msg = (err as { stderr?: string }).stderr ?? String(err);
    throw new Error(`worktree add failed: ${msg}`);
  }

  // After branching off the salvage ref, rebase the worktree onto the
  // current `origin/main`. The salvage tip can be days old; without the
  // rebase the agent would resume on stale state and produce a diff that
  // doesn't apply cleanly when the human merges. Conflicts here are a
  // structural signal (main moved in a way that touches the salvaged
  // edits) — we abort the rebase to leave the worktree in a recoverable
  // state and throw so the caller can surface the failure.
  if (opts.resumeFromBranch) {
    try {
      await execFile("git", ["rebase", "origin/main"], { cwd: wtPath });
    } catch (err) {
      const msg = (err as { stderr?: string }).stderr ?? String(err);
      // Best-effort: leave the worktree in a non-conflicted state by
      // aborting the in-progress rebase. Ignore errors from the abort
      // itself — even if it fails, the worktree is preserved on disk for
      // human inspection rather than silently dropped.
      try {
        await execFile("git", ["rebase", "--abort"], { cwd: wtPath });
      } catch {
        // ignore
      }
      throw new Error(
        `resume rebase onto origin/main failed for ${opts.resumeFromBranch}: ${msg}`,
      );
    }
  }

  return { path: wtPath, branch };
}

// Build the labeled ref for the safety-net partial push. The original branch
// shape `vp-dev/<agent>/issue-<N>` matches `VP_DEV_BRANCH_RE` (anchored `$`),
// so appending `-incomplete-<runId>` keeps the new ref OUT of the stale-branch
// sweep — incomplete branches are evidence for human inspection, not auto-
// cleaned. Sanitized to git-ref rules (alphanumerics + `-` + `/`).
export function buildIncompleteBranchName(originalBranch: string, runId: string): string {
  const safeRunId = runId.replace(/[^a-zA-Z0-9-]/g, "-");
  return `${originalBranch}-incomplete-${safeRunId}`;
}

export interface PushPartialBranchOpts {
  repoPath: string;
  worktreePath: string;
  worktreeBranch: string;
  incompleteBranch: string;
  runId: string;
  errorSubtype: string;
  targetRepo: string;
  logger?: Logger;
  agentId: string;
  issueId: number;
}

export interface PushPartialBranchResult {
  pushed: boolean;
  branchUrl?: string;
  /** Set when pushed === false. */
  reason?: string;
  /** True if a salvage commit was created on top of existing tree state. */
  committed?: boolean;
}

// Orchestrator-level safety net for non-clean agent exits. Fired by
// `shouldPushPartial()` in runIssueCore.ts for `error_max_turns`,
// `error_during_execution`, `error_max_budget_usd`, and the catch-all
// `isError && !envelope` (see issues #88, #95).
//
// Why this is a separate orchestrator path even though `runCodingAgent`
// already runs an in-agent recovery pass (see issue #76, commit d4aadd0):
// the recovery pass itself can fail — it consumes its own 5-turn budget,
// hits permission denials, or simply doesn't complete the push. When that
// happens, the existing `removeWorktree({ deleteBranch: true })` call below
// silently nukes the local branch and any uncommitted edits. This helper is
// the deterministic backstop that runs whether or not the agent recovered:
// shell-level git, no LLM in the loop. See issue #88.
//
// Steps:
//   1. `git status --porcelain` to detect uncommitted work in the worktree.
//   2. If anything uncommitted → `git add -A && git commit -m <salvage msg>`
//      so the in-flight edits are captured as a commit.
//   3. Compare HEAD against `origin/main` — if HEAD has at least one new
//      commit (the salvage commit, or pre-existing agent commits that were
//      never pushed), `git push -u origin HEAD:<incompleteBranch>`.
//   4. If the worktree is clean and there are no commits ahead of origin/main,
//      skip the push (nothing to preserve).
//
// Failure modes are surfaced via the `reason` field — the orchestrator never
// throws on partial-push failure; the agent's primary failure path is the
// authoritative outcome. Push-protection invariant: this never targets `main`
// (incompleteBranch always carries the `-incomplete-<runId>` suffix).
export async function pushPartialBranch(
  opts: PushPartialBranchOpts,
): Promise<PushPartialBranchResult> {
  // Reject anything resembling a `main` push at the helper boundary.
  // Belt-and-suspenders against future callers; the canonical caller in
  // runIssueCore always passes a `-incomplete-<runId>` suffixed name.
  if (opts.incompleteBranch === "main" || opts.incompleteBranch.endsWith("/main")) {
    return { pushed: false, reason: "refusing to push partial branch to main" };
  }

  // 1. Detect uncommitted work.
  let uncommitted = false;
  try {
    const { stdout } = await execFile("git", ["status", "--porcelain"], {
      cwd: opts.worktreePath,
    });
    uncommitted = stdout.trim().length > 0;
  } catch (err) {
    opts.logger?.warn("worktree.partial_push_status_failed", {
      agentId: opts.agentId,
      issueId: opts.issueId,
      err: (err as Error).message,
    });
    return {
      pushed: false,
      reason: `git status failed: ${(err as Error).message}`,
    };
  }

  // 2. Stage + commit if there are uncommitted edits.
  let committed = false;
  if (uncommitted) {
    try {
      await execFile("git", ["add", "-A"], { cwd: opts.worktreePath });
      // Empty author/committer env to inherit local git config; commit
      // message documents the salvage origin so a human pulling the branch
      // can grep `git log` for the runId.
      await execFile(
        "git",
        [
          "commit",
          "-m",
          `chore(salvage): partial work from runId=${opts.runId} (errorSubtype=${opts.errorSubtype})\n\nIn-flight edits captured by orchestrator safety net before worktree prune. Not finished work — review and discard or build on as appropriate.`,
        ],
        { cwd: opts.worktreePath },
      );
      committed = true;
    } catch (err) {
      // Hooks failing, identity-not-set, etc. Surface and bail — without
      // the commit, push has nothing new to carry.
      opts.logger?.warn("worktree.partial_push_commit_failed", {
        agentId: opts.agentId,
        issueId: opts.issueId,
        err: (err as { stderr?: string }).stderr ?? (err as Error).message,
      });
      return {
        pushed: false,
        reason: `salvage commit failed: ${
          (err as { stderr?: string }).stderr ?? (err as Error).message
        }`,
      };
    }
  }

  // 3. Anything to push? Compare HEAD vs origin/main. If we have commits
  // ahead (salvage, or pre-existing unpushed agent commits) we push; else
  // the worktree was a no-op and there's nothing to preserve.
  let aheadCount = 0;
  try {
    const { stdout } = await execFile(
      "git",
      ["rev-list", "--count", "origin/main..HEAD"],
      { cwd: opts.worktreePath },
    );
    aheadCount = parseInt(stdout.trim(), 10) || 0;
  } catch {
    // Best-effort; if rev-list fails we still attempt the push — push will
    // succeed iff the ref differs from any existing remote.
    aheadCount = committed ? 1 : 0;
  }

  if (aheadCount === 0) {
    return {
      pushed: false,
      committed,
      reason: "no commits ahead of origin/main; nothing to preserve",
    };
  }

  // 4. Push HEAD to the labeled incomplete branch on origin.
  try {
    await execFile(
      "git",
      [
        "push",
        "-u",
        "origin",
        `HEAD:refs/heads/${opts.incompleteBranch}`,
      ],
      { cwd: opts.worktreePath },
    );
  } catch (err) {
    opts.logger?.warn("worktree.partial_push_failed", {
      agentId: opts.agentId,
      issueId: opts.issueId,
      branch: opts.incompleteBranch,
      err: (err as { stderr?: string }).stderr ?? (err as Error).message,
    });
    return {
      pushed: false,
      committed,
      reason: `git push failed: ${
        (err as { stderr?: string }).stderr ?? (err as Error).message
      }`,
    };
  }

  const branchUrl = `https://github.com/${opts.targetRepo}/tree/${encodeURIComponent(
    opts.incompleteBranch,
  )}`;
  opts.logger?.info("worktree.partial_branch_pushed", {
    agentId: opts.agentId,
    issueId: opts.issueId,
    branch: opts.incompleteBranch,
    branchUrl,
    committed,
    aheadCount,
    errorSubtype: opts.errorSubtype,
    runId: opts.runId,
  });
  return { pushed: true, committed, branchUrl };
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

// Parses the worktree path out of `git branch -D`'s rejection message:
//   error: cannot delete branch '<branch>' used by worktree at '<path>'
// Falls back to undefined if the error format ever changes — callers
// should treat this as best-effort metadata, not a contract.
const WORKTREE_AT_RE = /used by worktree at '([^']+)'/;

function parseWorktreePathFromBranchDError(stderr: string): string | undefined {
  const m = WORKTREE_AT_RE.exec(stderr);
  return m ? m[1] : undefined;
}

export interface PruneStaleResult {
  pruned: number;
  kept: number;
  unprunable: UnprunableStaleBranch[];
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
//
// Some stale branches can't be deleted because the branch is still
// checked out in a worktree at a non-default path (e.g. a manually-created
// `.claude/worktrees/pr-43-conflict` for in-flight conflict resolution).
// `git branch -D` rejects these with an error, which we surface as
// structured `unprunable` entries — callers persist them into RunState so
// the user has an audit trail beyond the single dim warning. See #63.
export async function pruneStaleAgentBranches(
  repoPath: string,
  targetRepo: string,
  logger?: Logger,
): Promise<PruneStaleResult> {
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
    return { pruned: 0, kept: 0, unprunable: [] };
  }
  if (branches.length === 0) {
    logger?.info("worktree.stale_branches_swept", { pruned: 0, kept: 0, unprunable: 0 });
    return { pruned: 0, kept: 0, unprunable: [] };
  }

  let pruned = 0;
  let kept = 0;
  const unprunable: UnprunableStaleBranch[] = [];
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
      const stderr = (err as { stderr?: string }).stderr ?? (err as Error).message;
      const worktreePath = parseWorktreePathFromBranchDError(stderr);
      unprunable.push({
        branch,
        agentId,
        issueId,
        worktreePath,
        reason: stderr,
      });
      logger?.warn("worktree.stale_branch_delete_failed", {
        branch,
        agentId,
        issueId,
        worktreePath,
        err: stderr,
      });
    }
  }

  logger?.info("worktree.stale_branches_swept", {
    pruned,
    kept,
    unprunable: unprunable.length,
  });
  return { pruned, kept, unprunable };
}

// Renders a clearly-actionable warning summary for the unprunable branches
// returned by pruneStaleAgentBranches. Intended for direct stderr output —
// dim, scrolling-by event lines aren't enough (see #63). Uses ANSI colors
// only when stderr is a TTY so log capture stays clean.
const ANSI_YELLOW = "\x1b[33m";
const ANSI_BOLD = "\x1b[1m";
const ANSI_RESET = "\x1b[0m";

export function formatUnprunableWarning(
  unprunable: UnprunableStaleBranch[],
  opts: { color: boolean } = { color: false },
): string {
  if (unprunable.length === 0) return "";
  const y = opts.color ? ANSI_YELLOW : "";
  const b = opts.color ? ANSI_BOLD : "";
  const r = opts.color ? ANSI_RESET : "";
  const header = `${y}${b}WARNING:${r}${y} ${unprunable.length} stale branch(es) attached to a worktree could not be pruned.${r}`;
  const lines = [header];
  for (const u of unprunable) {
    const where = u.worktreePath ? ` — worktree at ${u.worktreePath}` : "";
    lines.push(`  ${u.branch}${where}`);
  }
  lines.push(
    "  To clean up: review the worktree, then `git worktree remove --force <path>` and `git branch -D <branch>`.",
  );
  lines.push(
    "  Recorded under `unprunableStaleBranches` in the run-state JSON for later audit.",
  );
  return lines.join("\n") + "\n";
}
