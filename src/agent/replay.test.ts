import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { applyReplayRollback, captureWorktreeDiff, readWorktreeHead } from "./replay.js";

const execFile = promisify(execFileCb);

async function makeFixtureRepo(): Promise<{
  repoRoot: string;
  seedSha: string;
  cleanup: () => Promise<void>;
}> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "replay-test-"));
  await execFile("git", ["init", "-q", "-b", "main", dir]);
  await execFile("git", ["-C", dir, "config", "user.email", "test@example.com"]);
  await execFile("git", ["-C", dir, "config", "user.name", "Test User"]);
  await execFile("git", ["-C", dir, "config", "commit.gpgsign", "false"]);
  await fs.writeFile(path.join(dir, "seed.txt"), "seed contents\n");
  await execFile("git", ["-C", dir, "add", "seed.txt"]);
  await execFile("git", ["-C", dir, "commit", "-q", "-m", "seed"]);
  const { stdout } = await execFile("git", ["-C", dir, "rev-parse", "HEAD"]);
  return {
    repoRoot: dir,
    seedSha: stdout.trim(),
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

test("applyReplayRollback: resets worktree HEAD to the supplied base SHA", async () => {
  const { repoRoot, seedSha, cleanup } = await makeFixtureRepo();
  try {
    // Make a second commit on top of the seed so HEAD diverges.
    await fs.writeFile(path.join(repoRoot, "seed.txt"), "post-seed contents\n");
    await execFile("git", ["-C", repoRoot, "add", "seed.txt"]);
    await execFile("git", ["-C", repoRoot, "commit", "-q", "-m", "second"]);
    const { stdout: tipBefore } = await execFile("git", ["-C", repoRoot, "rev-parse", "HEAD"]);
    assert.notEqual(tipBefore.trim(), seedSha);

    await applyReplayRollback({ worktreePath: repoRoot, baseSha: seedSha });

    const { stdout: tipAfter } = await execFile("git", ["-C", repoRoot, "rev-parse", "HEAD"]);
    assert.equal(tipAfter.trim(), seedSha);
    const seedFile = await fs.readFile(path.join(repoRoot, "seed.txt"), "utf-8");
    assert.equal(seedFile, "seed contents\n");
  } finally {
    await cleanup();
  }
});

test("applyReplayRollback: strips the `origin` remote so an agent-side rebase to upstream fails fast", async () => {
  const { repoRoot, seedSha, cleanup } = await makeFixtureRepo();
  try {
    // Wire up a fake `origin` and a remote-tracking ref so the rollback has
    // something to strip. The URL points at the same dir for fetchability.
    await execFile("git", ["-C", repoRoot, "remote", "add", "origin", repoRoot]);
    await execFile("git", ["-C", repoRoot, "fetch", "-q", "origin"]);
    await applyReplayRollback({ worktreePath: repoRoot, baseSha: seedSha });
    // Verify origin is gone — `git remote get-url origin` should error.
    await assert.rejects(
      execFile("git", ["-C", repoRoot, "remote", "get-url", "origin"]),
      /No such remote|fatal/,
    );
    // And `git rebase origin/main` should fail with an invalid-upstream
    // error rather than silently advancing HEAD past baseSha.
    await assert.rejects(
      execFile("git", ["-C", repoRoot, "rebase", "origin/main"]),
      /invalid upstream|unknown revision|fatal/,
    );
  } finally {
    await cleanup();
  }
});

test("applyReplayRollback: idempotent across cells reusing the same clone (no-op when origin already absent)", async () => {
  const { repoRoot, seedSha, cleanup } = await makeFixtureRepo();
  try {
    // Fixture has no origin remote — applyReplayRollback must not throw.
    await applyReplayRollback({ worktreePath: repoRoot, baseSha: seedSha });
    // Second call (simulating the next cell on the same clone) also fine.
    await applyReplayRollback({ worktreePath: repoRoot, baseSha: seedSha });
  } finally {
    await cleanup();
  }
});

test("applyReplayRollback: throws on unknown SHA", async () => {
  const { repoRoot, cleanup } = await makeFixtureRepo();
  try {
    await assert.rejects(
      applyReplayRollback({
        worktreePath: repoRoot,
        baseSha: "0000000000000000000000000000000000000000",
      }),
    );
  } finally {
    await cleanup();
  }
});

test("captureWorktreeDiff: writes a diff containing both modified and newly-created tracked files", async () => {
  const { repoRoot, cleanup } = await makeFixtureRepo();
  try {
    // Modify the seed file + create a new untracked file.
    await fs.writeFile(path.join(repoRoot, "seed.txt"), "modified contents\n");
    await fs.writeFile(path.join(repoRoot, "new.txt"), "brand new file\n");

    const outPath = path.join(repoRoot, "out", "captured.diff");
    await captureWorktreeDiff({ worktreePath: repoRoot, outPath });

    const diff = await fs.readFile(outPath, "utf-8");
    // Modified file diff
    assert.match(diff, /diff --git a\/seed\.txt b\/seed\.txt/);
    assert.match(diff, /-seed contents/);
    assert.match(diff, /\+modified contents/);
    // New file diff (added because git add -A staged it)
    assert.match(diff, /diff --git a\/new\.txt b\/new\.txt/);
    assert.match(diff, /\+brand new file/);
  } finally {
    await cleanup();
  }
});

test("captureWorktreeDiff: writes an empty file when worktree is clean", async () => {
  const { repoRoot, cleanup } = await makeFixtureRepo();
  try {
    const outPath = path.join(repoRoot, "out", "empty.diff");
    await captureWorktreeDiff({ worktreePath: repoRoot, outPath });
    const diff = await fs.readFile(outPath, "utf-8");
    assert.equal(diff, "");
  } finally {
    await cleanup();
  }
});

test("captureWorktreeDiff: with baseSha, captures committed work the agent made on its branch", async () => {
  const { repoRoot, seedSha, cleanup } = await makeFixtureRepo();
  try {
    // Simulate the production flow: agent edits files, runs `git commit` on
    // its branch (worktree clean afterwards), then capture runs.
    await execFile("git", ["-C", repoRoot, "checkout", "-q", "-b", "agent-branch"]);
    await fs.writeFile(path.join(repoRoot, "seed.txt"), "agent-edited\n");
    await fs.writeFile(path.join(repoRoot, "feature.txt"), "new feature file\n");
    await execFile("git", ["-C", repoRoot, "add", "-A"]);
    await execFile("git", ["-C", repoRoot, "commit", "-q", "-m", "agent work"]);

    const outPath = path.join(repoRoot, "out", "post-commit.diff");
    await captureWorktreeDiff({ worktreePath: repoRoot, outPath, baseSha: seedSha });

    const diff = await fs.readFile(outPath, "utf-8");
    assert.match(diff, /diff --git a\/seed\.txt b\/seed\.txt/);
    assert.match(diff, /\+agent-edited/);
    assert.match(diff, /diff --git a\/feature\.txt b\/feature\.txt/);
    assert.match(diff, /\+new feature file/);
  } finally {
    await cleanup();
  }
});

test("captureWorktreeDiff: with baseSha, captures committed + uncommitted edits in one diff", async () => {
  const { repoRoot, seedSha, cleanup } = await makeFixtureRepo();
  try {
    await execFile("git", ["-C", repoRoot, "checkout", "-q", "-b", "agent-branch"]);
    await fs.writeFile(path.join(repoRoot, "seed.txt"), "first edit\n");
    await execFile("git", ["-C", repoRoot, "add", "-A"]);
    await execFile("git", ["-C", repoRoot, "commit", "-q", "-m", "first"]);
    // Leftover uncommitted edit (the agent ran out of turns before committing)
    await fs.writeFile(path.join(repoRoot, "leftover.txt"), "uncommitted\n");

    const outPath = path.join(repoRoot, "out", "mixed.diff");
    await captureWorktreeDiff({ worktreePath: repoRoot, outPath, baseSha: seedSha });

    const diff = await fs.readFile(outPath, "utf-8");
    assert.match(diff, /\+first edit/);
    assert.match(diff, /diff --git a\/leftover\.txt b\/leftover\.txt/);
    assert.match(diff, /\+uncommitted/);
  } finally {
    await cleanup();
  }
});

test("readWorktreeHead: returns the worktree's current HEAD SHA", async () => {
  const { repoRoot, seedSha, cleanup } = await makeFixtureRepo();
  try {
    const head = await readWorktreeHead(repoRoot);
    assert.equal(head, seedSha);
    // Advance HEAD with a second commit and re-read.
    await fs.writeFile(path.join(repoRoot, "seed.txt"), "second\n");
    await execFile("git", ["-C", repoRoot, "add", "-A"]);
    await execFile("git", ["-C", repoRoot, "commit", "-q", "-m", "second"]);
    const headAfter = await readWorktreeHead(repoRoot);
    assert.notEqual(headAfter, seedSha);
    assert.match(headAfter, /^[0-9a-f]{40}$/);
  } finally {
    await cleanup();
  }
});

test("captureWorktreeDiff: WITHOUT baseSha after commit returns EMPTY diff (the bug runIssueCore's HEAD snapshot works around)", async () => {
  // This test pins down the bug shape that motivates the runIssueCore
  // snapshot: when the agent commits its work and capture is invoked
  // without a baseSha, `git diff --cached` is HEAD-relative and silently
  // drops the entire commit. The fix lives in runIssueCore (it snapshots
  // HEAD pre-agent and threads it as baseSha); this test asserts the
  // failure mode the snapshot prevents.
  const { repoRoot, cleanup } = await makeFixtureRepo();
  try {
    await execFile("git", ["-C", repoRoot, "checkout", "-q", "-b", "agent-branch"]);
    await fs.writeFile(path.join(repoRoot, "seed.txt"), "agent-edited\n");
    await execFile("git", ["-C", repoRoot, "add", "-A"]);
    await execFile("git", ["-C", repoRoot, "commit", "-q", "-m", "agent work"]);

    const outPath = path.join(repoRoot, "out", "no-base.diff");
    await captureWorktreeDiff({ worktreePath: repoRoot, outPath });

    const diff = await fs.readFile(outPath, "utf-8");
    assert.equal(diff, "", "without baseSha the agent's commit is silently dropped");
  } finally {
    await cleanup();
  }
});

test("captureWorktreeDiff: creates parent directory of outPath if missing", async () => {
  const { repoRoot, cleanup } = await makeFixtureRepo();
  try {
    await fs.writeFile(path.join(repoRoot, "seed.txt"), "x\n");
    const outPath = path.join(repoRoot, "deeply", "nested", "dir", "out.diff");
    await captureWorktreeDiff({ worktreePath: repoRoot, outPath });
    const stat = await fs.stat(outPath);
    assert.ok(stat.isFile());
  } finally {
    await cleanup();
  }
});
