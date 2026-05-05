// File-system tests for the two-tier shared-lessons pool (#101). Uses
// process.env overrides + a tmp `XDG_CONFIG_HOME` so the global tier
// resolves under a sandbox dir rather than the user's real home.
import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  appendLessonToPool,
  listSharedLessonDomains,
  readSharedLessonsForDomains,
  sharedLessonsDir,
  sharedLessonsPath,
} from "./sharedLessons.js";

async function withSandbox(fn: (sandbox: string) => Promise<void>): Promise<void> {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "vp-shared-lessons-"));
  const prevXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = sandbox;
  try {
    await fn(sandbox);
  } finally {
    if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = prevXdg;
    await fs.rm(sandbox, { recursive: true, force: true });
  }
}

test("sharedLessonsDir: global tier honours XDG_CONFIG_HOME", async () => {
  await withSandbox(async (sandbox) => {
    const dir = sharedLessonsDir("global");
    assert.equal(dir, path.join(sandbox, "vaultpilot", "shared-lessons"));
  });
});

test("sharedLessonsDir: target tier is independent of XDG", async () => {
  await withSandbox(async () => {
    const dir = sharedLessonsDir("target");
    assert.ok(
      dir.endsWith(path.join("agents", ".shared", "lessons")),
      `target tier should sit under agents/.shared/lessons, got ${dir}`,
    );
  });
});

test("sharedLessonsPath: rejects invalid domain shape", () => {
  assert.throws(() => sharedLessonsPath("global", "Solana"));
  assert.throws(() => sharedLessonsPath("global", ""));
  assert.throws(() => sharedLessonsPath("target", "foo_bar"));
});

test("appendLessonToPool: writes to global tier when tier='global'", async () => {
  await withSandbox(async (sandbox) => {
    const outcome = await appendLessonToPool({
      tier: "global",
      domain: "solana",
      body: "ERC observation: descriptive lesson body about Solana.",
      sourceAgentId: "agent-test",
      issueId: 101,
      ts: "2026-05-05T00:00:00.000Z",
    });
    assert.equal(outcome.kind, "appended");
    if (outcome.kind === "appended") {
      assert.equal(outcome.tier, "global");
      assert.ok(
        outcome.filePath.startsWith(path.join(sandbox, "vaultpilot", "shared-lessons")),
        `expected global path under sandbox, got ${outcome.filePath}`,
      );
      const content = await fs.readFile(outcome.filePath, "utf-8");
      assert.match(content, /Shared lessons: solana \(global\)/);
      assert.match(content, /descriptive lesson body about Solana/);
    }
  });
});

test("appendLessonToPool: rejects validation failure (empty body) without writing", async () => {
  await withSandbox(async () => {
    const outcome = await appendLessonToPool({
      tier: "global",
      domain: "solana",
      body: "   \n  \n",
      sourceAgentId: "agent-test",
      issueId: 101,
    });
    assert.equal(outcome.kind, "rejected-validation");
  });
});

test("readSharedLessonsForDomains: tier isolation — global write is invisible to target read", async () => {
  await withSandbox(async () => {
    await appendLessonToPool({
      tier: "global",
      domain: "eip-712",
      body: "Typed-data digest must be recomputed locally before signing.",
      sourceAgentId: "agent-test",
      issueId: 101,
      ts: "2026-05-05T00:00:00.000Z",
    });
    const globalRead = await readSharedLessonsForDomains("global", ["eip-712"]);
    assert.equal(globalRead.length, 1);
    assert.equal(globalRead[0].tier, "global");
    assert.equal(globalRead[0].domain, "eip-712");

    // Target tier path lives under cwd/agents/.shared/lessons — it has no
    // `eip-712.md` file in the worktree's gitignored agents/ dir for this
    // test. Either the file is missing entirely (ENOENT) or it exists from
    // some prior fixture but doesn't carry the body we just wrote globally.
    const targetRead = await readSharedLessonsForDomains("target", ["eip-712"]);
    for (const pool of targetRead) {
      assert.doesNotMatch(
        pool.content,
        /Typed-data digest must be recomputed locally before signing/,
        "global-tier append should not leak into target-tier reads",
      );
    }
  });
});

test("listSharedLessonDomains: returns ENOENT-empty list when global dir does not exist", async () => {
  await withSandbox(async () => {
    // Sandbox is fresh; no shared-lessons dir created. Should be silent [].
    const pools = await listSharedLessonDomains("global");
    assert.deepEqual(pools, []);
  });
});

test("listSharedLessonDomains: surfaces written global-tier pools with tier label", async () => {
  await withSandbox(async () => {
    await appendLessonToPool({
      tier: "global",
      domain: "aave",
      body: "Aave v3 caps borrow at debt ceiling — check before tx prep.",
      sourceAgentId: "agent-test",
      issueId: 101,
      ts: "2026-05-05T00:00:00.000Z",
    });
    const pools = await listSharedLessonDomains("global");
    assert.equal(pools.length, 1);
    assert.equal(pools[0].tier, "global");
    assert.equal(pools[0].domain, "aave");
    assert.ok(pools[0].totalLines > 1);
  });
});

test("readSharedLessonsForDomains: filters invalid domains and dedups", async () => {
  await withSandbox(async () => {
    await appendLessonToPool({
      tier: "global",
      domain: "solana",
      body: "Sample portable lesson about Solana.",
      sourceAgentId: "agent-test",
      issueId: 101,
      ts: "2026-05-05T00:00:00.000Z",
    });
    // Pass invalid domain + duplicate; expect a single entry back.
    const out = await readSharedLessonsForDomains("global", [
      "Solana",
      "solana",
      "solana",
      "",
      "foo_bar",
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].domain, "solana");
  });
});
