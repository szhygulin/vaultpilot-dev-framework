import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { applyReplayRollback, captureWorktreeDiff } from "./replay.js";

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
