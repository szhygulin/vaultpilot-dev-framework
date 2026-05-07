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
 * Capture the worktree's diff (modified + new files) and write it to
 * `outPath`. The output feeds the test-runner and reasoning judge in later
 * phases.
 *
 * Approach: stage everything with `git add -A`, then emit `git diff --cached`.
 * Staging first ensures newly-created tracked files (which `git diff HEAD`
 * alone would miss) appear in the output. The worktree is about to be torn
 * down by removeWorktree, so the index mutation has no lasting effect.
 *
 * Parent directory of `outPath` is created if missing. `maxBuffer` is set
 * to 32 MiB — diffs from a 50-turn coding-agent run rarely exceed a few KB,
 * but the cap protects against a runaway agent that touched many files.
 */
export async function captureWorktreeDiff(opts: {
  worktreePath: string;
  outPath: string;
}): Promise<void> {
  await fs.mkdir(path.dirname(opts.outPath), { recursive: true });
  await execFile("git", ["-C", opts.worktreePath, "add", "-A"]);
  const { stdout } = await execFile(
    "git",
    ["-C", opts.worktreePath, "diff", "--cached"],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  await fs.writeFile(opts.outPath, stdout);
}
