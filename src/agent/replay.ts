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

/**
 * Reset the worktree to a specific git SHA. Used for closed-issue replay so
 * the coding agent encounters the codebase at the issue's pre-fix base SHA
 * rather than current main (where the merged fix already landed).
 *
 * Throws if the SHA is unknown or the reset fails — callers let the
 * orchestrator surface the error rather than swallowing it. Open-issue
 * dispatches skip this helper entirely (no baseSha supplied).
 */
export async function applyReplayRollback(opts: {
  worktreePath: string;
  baseSha: string;
}): Promise<void> {
  await execFile("git", ["-C", opts.worktreePath, "reset", "--hard", opts.baseSha]);
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
