import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import {
  DEFAULT_BASE_REF,
  openLocalClaudePr,
  type PrCreator,
} from "./localClaudePr.js";

const execFile = promisify(execFileCb);

/**
 * Build a throwaway repo to host a worktree base ref. Returns the repo
 * root + a base ref (`main`) that the openLocalClaudePr call can branch
 * off. Uses `git init` + a minimal seed commit + a CLAUDE.md so the
 * append step has something to read.
 */
async function makeFixtureRepo(): Promise<{
  repoRoot: string;
  baseRef: string;
  cleanup: () => Promise<void>;
}> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "local-claude-pr-test-"));
  await execFile("git", ["init", "-q", "-b", "main", dir]);
  await execFile("git", ["-C", dir, "config", "user.email", "test@example.com"]);
  await execFile("git", ["-C", dir, "config", "user.name", "Test User"]);
  await execFile("git", ["-C", dir, "config", "commit.gpgsign", "false"]);
  await fs.writeFile(
    path.join(dir, "CLAUDE.md"),
    "# Project rules\n\n## Existing section\n\nExisting body.\n",
  );
  await execFile("git", ["-C", dir, "add", "CLAUDE.md"]);
  await execFile("git", ["-C", dir, "commit", "-q", "-m", "seed"]);
  return {
    repoRoot: dir,
    baseRef: "main",
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

// --------------------------------------------------------------------
// Happy path: gate=let-through, prCreator returns a URL
// --------------------------------------------------------------------

test("openLocalClaudePr: appends to CLAUDE.md, commits, and reports the PR URL", async () => {
  const { repoRoot, baseRef, cleanup } = await makeFixtureRepo();
  try {
    const captured: { branch?: string; title?: string; body?: string } = {};
    // Mock the push (no remote) — replace `git push` by stubbing the prCreator
    // and letting the rest of the flow run. Since push has no remote, the test
    // environment skips it via prCreator override... but openLocalClaudePr
    // calls push BEFORE prCreator. Stub git push by setting a fake remote.
    await execFile("git", ["-C", repoRoot, "remote", "add", "origin", repoRoot]);
    // Allow pushing into the same bare-ish repo. Easier: use a separate bare
    // remote.
    const bareDir = await fs.mkdtemp(path.join(os.tmpdir(), "bare-remote-"));
    await execFile("git", ["init", "-q", "--bare", bareDir]);
    await execFile("git", ["-C", repoRoot, "remote", "set-url", "origin", bareDir]);
    try {
      const prCreator: PrCreator = async (input) => {
        captured.branch = input.branch;
        captured.title = input.title;
        captured.body = input.body;
        return { prUrl: "https://example.test/pull/42" };
      };
      const outcome = await openLocalClaudePr({
        sourceAgentId: "agent-test-001",
        ts: "2026-05-06T16:00:00.000Z",
        utility: 0.85,
        gate: {
          decision: "let-through",
          costScore: 0.4,
          threshold: 0.8,
          ratio: 2.0,
        },
        body: "## Pre-dispatch foo\n\nProject-wide rule body.",
        repoRoot,
        baseRef,
        prCreator,
      });
      assert.equal(outcome.kind, "pr-opened");
      if (outcome.kind === "pr-opened") {
        assert.equal(outcome.prUrl, "https://example.test/pull/42");
        assert.match(outcome.branchName, /^chore\/local-claude-from-agent-test-001-/);
      }
      // PR creator received the right inputs.
      assert.match(captured.branch ?? "", /^chore\/local-claude-from-agent-test-001-/);
      assert.match(captured.title ?? "", /docs\(CLAUDE\.md\): Pre-dispatch foo/);
      assert.match(captured.body ?? "", /predictedUtility: 0\.85/);
      assert.match(captured.body ?? "", /L2 gate: decision=let-through/);
      // Worktree was cleaned up.
      const worktrees = await execFile("git", ["-C", repoRoot, "worktree", "list"]);
      assert.equal(worktrees.stdout.split("\n").filter(Boolean).length, 1);
    } finally {
      await fs.rm(bareDir, { recursive: true, force: true });
    }
  } finally {
    await cleanup();
  }
});

// --------------------------------------------------------------------
// PR creator throws → pr-failed; queue fallback is the caller's responsibility
// --------------------------------------------------------------------

test("openLocalClaudePr: prCreator failure surfaces as pr-failed with reason", async () => {
  const { repoRoot, baseRef, cleanup } = await makeFixtureRepo();
  try {
    const bareDir = await fs.mkdtemp(path.join(os.tmpdir(), "bare-remote-"));
    await execFile("git", ["init", "-q", "--bare", bareDir]);
    await execFile("git", ["-C", repoRoot, "remote", "add", "origin", bareDir]);
    try {
      const prCreator: PrCreator = async () => {
        throw new Error("simulated gh failure");
      };
      const outcome = await openLocalClaudePr({
        sourceAgentId: "agent-test-002",
        ts: "2026-05-06T16:01:00.000Z",
        body: "## fail-path\n\nbody",
        repoRoot,
        baseRef,
        prCreator,
      });
      assert.equal(outcome.kind, "pr-failed");
      if (outcome.kind === "pr-failed") {
        assert.match(outcome.reason, /gh-pr-create.*simulated gh failure/);
        assert.match(outcome.branchName ?? "", /^chore\/local-claude-from-agent-test-002-/);
      }
      // Worktree still cleaned.
      const worktrees = await execFile("git", ["-C", repoRoot, "worktree", "list"]);
      assert.equal(worktrees.stdout.split("\n").filter(Boolean).length, 1);
    } finally {
      await fs.rm(bareDir, { recursive: true, force: true });
    }
  } finally {
    await cleanup();
  }
});

// --------------------------------------------------------------------
// Worktree creation fails (no git in path / bad baseRef)
// --------------------------------------------------------------------

test("openLocalClaudePr: worktree-add failure surfaces as pr-failed", async () => {
  const { repoRoot, cleanup } = await makeFixtureRepo();
  try {
    const prCreator: PrCreator = async () => ({ prUrl: "https://nope" });
    const outcome = await openLocalClaudePr({
      sourceAgentId: "agent-test-003",
      ts: "2026-05-06T16:02:00.000Z",
      body: "body",
      repoRoot,
      baseRef: "nonexistent-branch",
      prCreator,
    });
    assert.equal(outcome.kind, "pr-failed");
    if (outcome.kind === "pr-failed") {
      assert.match(outcome.reason, /worktree-add/);
    }
  } finally {
    await cleanup();
  }
});

// --------------------------------------------------------------------
// Constants sanity
// --------------------------------------------------------------------

test("DEFAULT_BASE_REF points at origin/main", () => {
  assert.equal(DEFAULT_BASE_REF, "origin/main");
});
