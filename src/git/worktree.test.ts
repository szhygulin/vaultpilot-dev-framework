import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { buildIncompleteBranchName, ensureOriginRemote } from "./worktree.js";

const execFile = promisify(execFileCb);

async function makeBareClonePair(): Promise<{
  bareRepo: string;
  cloneDir: string;
  cleanup: () => Promise<void>;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ensure-origin-"));
  const bareRepo = path.join(root, "upstream.git");
  const cloneDir = path.join(root, "clone");
  await execFile("git", ["init", "-q", "--bare", "-b", "main", bareRepo]);
  await execFile("git", ["clone", "-q", bareRepo, cloneDir]);
  await execFile("git", ["-C", cloneDir, "config", "user.email", "test@example.com"]);
  await execFile("git", ["-C", cloneDir, "config", "user.name", "Test User"]);
  await execFile("git", ["-C", cloneDir, "config", "commit.gpgsign", "false"]);
  return {
    bareRepo,
    cloneDir,
    cleanup: async () => fs.rm(root, { recursive: true, force: true }),
  };
}

// Canonical runId shape from `makeRunId()`:
// `run-2026-05-04T16-53-06-188Z` — alphanumerics, `-`, `T`, `Z`. Already
// git-ref-safe; the helper passes it through.
test("preserves canonical run-<iso> runId verbatim", () => {
  const branch = buildIncompleteBranchName(
    "vp-dev/agent-72c6/issue-88",
    "run-2026-05-04T16-53-06-188Z",
  );
  assert.equal(
    branch,
    "vp-dev/agent-72c6/issue-88-incomplete-run-2026-05-04T16-53-06-188Z",
  );
});

test("sanitizes runId chars that aren't alphanumeric or '-'", () => {
  // Hypothetical future runId formats with `:`, `.`, `/` etc. would break
  // git ref rules — the helper must scrub them.
  const branch = buildIncompleteBranchName(
    "vp-dev/agent-aa26/issue-34",
    "run-2026:05:04T17.48.07/803Z",
  );
  // `:` `.` `/` all mapped to `-`. The original branch slashes stay.
  assert.equal(
    branch,
    "vp-dev/agent-aa26/issue-34-incomplete-run-2026-05-04T17-48-07-803Z",
  );
});

test("does not match the stale-branch sweep regex (anchored vp-dev pattern)", () => {
  // Defensive check: the existing prune sweep uses
  //   /^vp-dev\/(agent-[a-z0-9-]+)\/issue-(\d+)$/
  // The trailing `$` plus the `-incomplete-<runId>` suffix means our
  // labeled refs are NOT auto-cleaned by the sweep. Encoded here so a
  // future regex tweak in worktree.ts doesn't silently start eating the
  // salvage branches.
  const sweepRegex = /^vp-dev\/(agent-[a-z0-9-]+)\/issue-(\d+)$/;
  const incomplete = buildIncompleteBranchName(
    "vp-dev/agent-72c6/issue-88",
    "run-2026-05-04T16-53-06-188Z",
  );
  assert.equal(sweepRegex.test(incomplete), false);
  // Sanity: the original (pre-suffix) branch DOES match the sweep regex.
  assert.equal(sweepRegex.test("vp-dev/agent-72c6/issue-88"), true);
});

test("preserves multi-digit issue numbers and lowercase agent ids", () => {
  const branch = buildIncompleteBranchName(
    "vp-dev/agent-ef41/issue-1234",
    "run-X",
  );
  assert.equal(branch, "vp-dev/agent-ef41/issue-1234-incomplete-run-X");
});

// --- ensureOriginRemote (#253) ---------------------------------------------

test("ensureOriginRemote: no-op when origin is already configured", async () => {
  const { cloneDir, bareRepo, cleanup } = await makeBareClonePair();
  try {
    // `git clone` already wired up `origin` to bareRepo. Helper must not
    // mutate it.
    const result = await ensureOriginRemote(cloneDir, "owner/repo");
    assert.equal(result.added, false);
    const { stdout } = await execFile("git", ["-C", cloneDir, "remote", "get-url", "origin"]);
    assert.equal(stdout.trim(), bareRepo);
  } finally {
    await cleanup();
  }
});

test("ensureOriginRemote: re-adds origin from canonical GitHub URL when missing (issue #253)", async () => {
  const { cloneDir, cleanup } = await makeBareClonePair();
  try {
    // Simulate the replay-mode strip: another cell removed origin from
    // the shared `.git/config`.
    await execFile("git", ["-C", cloneDir, "remote", "remove", "origin"]);
    const result = await ensureOriginRemote(cloneDir, "szhygulin/vaultpilot-dev-framework");
    assert.equal(result.added, true);
    const { stdout } = await execFile("git", ["-C", cloneDir, "remote", "get-url", "origin"]);
    assert.equal(stdout.trim(), "https://github.com/szhygulin/vaultpilot-dev-framework");
  } finally {
    await cleanup();
  }
});

test("ensureOriginRemote: idempotent — calling twice without intervening strip is a no-op the second time", async () => {
  const { cloneDir, cleanup } = await makeBareClonePair();
  try {
    await execFile("git", ["-C", cloneDir, "remote", "remove", "origin"]);
    const first = await ensureOriginRemote(cloneDir, "owner/repo");
    assert.equal(first.added, true);
    const second = await ensureOriginRemote(cloneDir, "owner/repo");
    assert.equal(second.added, false);
  } finally {
    await cleanup();
  }
});
