import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import {
  buildIncompleteBranchName,
  ensureOriginRemote,
  resolveTargetRepoPath,
} from "./worktree.js";

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

// ---------------------------------------------------------------------------
// resolveTargetRepoPath — issue #254 two-path fallback.
//
// Convention: $HOME/dev/<repo-name>. Fallback: $HOME/dev/vaultpilot/<repo-name>
// (the grouped layout used by this repo's operator after the
// vaultpilot-dev-framework rename, when the outer back-compat symlink may
// be missing). Tests run with a tmpdir HOME so they don't depend on the
// caller's actual layout.
// ---------------------------------------------------------------------------

async function withTmpHome<T>(
  fn: (homeDir: string) => Promise<T>,
): Promise<T> {
  const homeDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "vp-resolve-target-"),
  );
  const prevHome = process.env.HOME;
  process.env.HOME = homeDir;
  try {
    return await fn(homeDir);
  } finally {
    if (prevHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = prevHome;
    }
    await fs.rm(homeDir, { recursive: true, force: true });
  }
}

async function makeFakeClone(parent: string, name: string): Promise<string> {
  const repoDir = path.join(parent, name);
  await fs.mkdir(path.join(repoDir, ".git"), { recursive: true });
  return repoDir;
}

test("resolveTargetRepoPath: prefers conventional $HOME/dev/<name> when present", async () => {
  await withTmpHome(async (home) => {
    const expected = await makeFakeClone(path.join(home, "dev"), "demo-repo");
    // Also make the grouped fallback exist — flat must still win.
    await makeFakeClone(path.join(home, "dev", "vaultpilot"), "demo-repo");
    const got = await resolveTargetRepoPath("octo/demo-repo");
    assert.equal(got, expected);
  });
});

test("resolveTargetRepoPath: falls back to $HOME/dev/vaultpilot/<name> when flat path is missing", async () => {
  await withTmpHome(async (home) => {
    const expected = await makeFakeClone(
      path.join(home, "dev", "vaultpilot"),
      "vaultpilot-dev-framework",
    );
    const got = await resolveTargetRepoPath(
      "szhygulin/vaultpilot-dev-framework",
    );
    assert.equal(got, expected);
  });
});

test("resolveTargetRepoPath: throws ENOENT naming both candidates when neither exists", async () => {
  await withTmpHome(async (home) => {
    await assert.rejects(
      () => resolveTargetRepoPath("octo/missing-repo"),
      (err: NodeJS.ErrnoException) => {
        assert.equal(err.code, "ENOENT");
        assert.match(err.message, /missing-repo/);
        assert.match(err.message, /dev\/missing-repo/);
        assert.match(err.message, /dev\/vaultpilot\/missing-repo/);
        // Sanity: home is what we expect (tmp).
        assert.match(err.message, new RegExp(home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        return true;
      },
    );
  });
});

test("resolveTargetRepoPath: explicit path wins regardless of convention layout", async () => {
  await withTmpHome(async (home) => {
    // Conventional path also exists — explicit must still win.
    await makeFakeClone(path.join(home, "dev"), "explicit-repo");
    const customParent = await fs.mkdtemp(
      path.join(os.tmpdir(), "vp-explicit-"),
    );
    try {
      const explicit = await makeFakeClone(customParent, "explicit-repo");
      const got = await resolveTargetRepoPath(
        "octo/explicit-repo",
        explicit,
      );
      assert.equal(got, explicit);
    } finally {
      await fs.rm(customParent, { recursive: true, force: true });
    }
  });
});
