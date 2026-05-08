// Per-cell rollback + diff capture for the curve-redo calibration flow
// (Phase 1a of the curve-redo plan). Both helpers operate on a worktree
// directory and shell out to git via `execFile`.
//
// `runIssueCore` calls these when its `replayMode` field is set:
//   - applyReplayRollback runs BEFORE the coding agent so the worktree
//     reflects the issue's pre-fix base SHA (closed-issue replay).
//   - captureWorktreeDiff runs AFTER the agent finishes so the worktree's
//     uncommitted edits are persisted before removeWorktree teardown.
//
// In `--dry-run` (used by the calibration flow), branch / push / PR-create
// are intercepted at the SDK boundary, but the agent's file edits in the
// worktree are real. Diff capture is the only way to retain those edits
// for downstream scoring (test-runner + reasoning judge).

import { execFile as execFileCb } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export interface ApplyReplayRollbackResult {
  /**
   * URL of the `origin` remote captured before the strip. The orchestrator
   * passes this back to `restoreOriginRemote` after the agent finishes so
   * the shared `.git/config` is left clean for the next cell on the same
   * clone. `undefined` when the strip ran against a clone that already had
   * no origin (e.g. a sibling cell stripped first).
   */
  originUrl?: string;
}

/**
 * Reset the worktree to a specific git SHA. Used for closed-issue replay so
 * the coding agent encounters the codebase at the issue's pre-fix base SHA
 * rather than current main (where the merged fix already landed).
 *
 * Throws if the SHA is unknown or the reset fails — callers let the
 * orchestrator surface the error rather than swallowing it. Open-issue
 * dispatches skip this helper entirely (no baseSha supplied).
 *
 * Returns the pre-strip `origin` URL so the caller can restore it after the
 * agent finishes (issue #253). The strip mutates the SHARED `.git/config`
 * because non-bare clones don't scope `git remote remove` to the worktree;
 * leaving that mutation in place broke every subsequent cell's
 * `createWorktree` fetch on the same clone. Pairing strip with restore (and
 * a defensive `ensureOriginRemote` in `createWorktree`) keeps the cross-cell
 * surface clean.
 */
export async function applyReplayRollback(opts: {
  worktreePath: string;
  baseSha: string;
}): Promise<ApplyReplayRollbackResult> {
  await execFile("git", ["-C", opts.worktreePath, "reset", "--hard", opts.baseSha]);
  // Replay-mode invariant: the agent must encounter the pre-fix codebase
  // state. Larger trim CLAUDE.mds carry a "sync to main before work" rule
  // that, when followed, runs `git rebase origin/main` and undoes the
  // rollback — corrupting the captured diff with every upstream commit
  // (smoke 2026-05-07 saw 1433 files in a 58KB-trim cell vs 2 files in a
  // 6KB-trim cell on the same issue). Strip the `origin` remote so any
  // sync attempt fails fast. `--dry-run` already intercepts push; replay
  // never reads from origin afterwards.
  //
  // Save the URL FIRST so the caller can restore it on cleanup. Best-effort:
  // a sibling cell may already have stripped origin, in which case we leave
  // `originUrl` undefined and rely on `ensureOriginRemote` in the next
  // `createWorktree` to reconstruct from the targetRepo slug.
  let originUrl: string | undefined;
  try {
    const { stdout } = await execFile("git", [
      "-C",
      opts.worktreePath,
      "remote",
      "get-url",
      "origin",
    ]);
    originUrl = stdout.trim() || undefined;
  } catch {
    // origin already absent — sibling cell stripped first, or clone has
    // no remote configured. `originUrl` stays undefined.
  }
  try {
    await execFile("git", ["-C", opts.worktreePath, "remote", "remove", "origin"]);
  } catch {
    // remote may already be absent (e.g. subsequent cells reusing the same
    // clone where a prior cell stripped it). Best-effort, idempotent.
  }
  return { originUrl };
}

/**
 * Restore the `origin` remote URL after a replay-mode cell finishes (#253).
 *
 * Called from `runIssueCore`'s finally block, paired with the saved URL
 * returned by `applyReplayRollback`. Idempotent against concurrent cells:
 * if a sibling cell already re-added origin (via `ensureOriginRemote`), we
 * fall through to `set-url` rather than throwing on the duplicate. No-op
 * when the saved URL is `undefined` (a sibling stripped first).
 */
export async function restoreOriginRemote(opts: {
  worktreePath: string;
  originUrl?: string;
}): Promise<void> {
  if (!opts.originUrl) return;
  try {
    await execFile("git", [
      "-C",
      opts.worktreePath,
      "remote",
      "add",
      "origin",
      opts.originUrl,
    ]);
    return;
  } catch {
    // origin already exists (sibling cell restored). Fall through.
  }
  try {
    await execFile("git", [
      "-C",
      opts.worktreePath,
      "remote",
      "set-url",
      "origin",
      opts.originUrl,
    ]);
  } catch {
    // Best-effort: leaving an existing-but-different URL is preferable to
    // throwing. The next cell's `ensureOriginRemote` will see a present
    // origin and treat it as a no-op.
  }
}

/**
 * Read the worktree's current HEAD SHA. The orchestrator snapshots HEAD
 * pre-agent (after any replay rollback) so captureWorktreeDiff has a stable
 * base even when the caller didn't pass an explicit replay baseSha — without
 * this, open-issue cells whose agent commits its work emit empty diffs
 * because `git diff --cached` is HEAD-relative.
 */
export async function readWorktreeHead(worktreePath: string): Promise<string> {
  const { stdout } = await execFile("git", ["-C", worktreePath, "rev-parse", "HEAD"]);
  return stdout.trim();
}

/**
 * Capture the worktree's diff (modified + new files, committed + uncommitted)
 * and write it to `outPath`. The output feeds the test-runner and reasoning
 * judge in later phases.
 *
 * Approach: stage everything with `git add -A`, then emit `git diff --cached
 * <baseSha>`. Staging first ensures newly-created tracked files (which a
 * HEAD-only diff would miss) appear in the output; diffing against the
 * replay base SHA captures both committed work (the coding agent typically
 * runs `git commit` on its branch) AND any leftover uncommitted edits in the
 * same diff. Without `baseSha`, `git diff --cached` is HEAD-relative and
 * silently drops the entire commit the agent just made.
 *
 * Parent directory of `outPath` is created if missing. `maxBuffer` is set
 * to 32 MiB — diffs from a 50-turn coding-agent run rarely exceed a few KB,
 * but the cap protects against a runaway agent that touched many files.
 */
export async function captureWorktreeDiff(opts: {
  worktreePath: string;
  outPath: string;
  baseSha?: string;
}): Promise<void> {
  await fs.mkdir(path.dirname(opts.outPath), { recursive: true });
  await execFile("git", ["-C", opts.worktreePath, "add", "-A"]);
  const args = ["-C", opts.worktreePath, "diff", "--cached"];
  if (opts.baseSha) args.push(opts.baseSha);
  const { stdout } = await execFile("git", args, { maxBuffer: 32 * 1024 * 1024 });
  await fs.writeFile(opts.outPath, stdout);
}
