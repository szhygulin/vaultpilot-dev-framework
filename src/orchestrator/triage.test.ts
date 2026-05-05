import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { __testInternals, TRIAGE_DIR } from "./triage.js";

// Tests for issue #137 — "Plan diverged" recurrence on first --confirm. The
// root cause is non-determinism in the gate's `Triage cost:` line: at
// --plan time the cache is cold and `costUsd` reflects real spend, but at
// --confirm time the cache is warm and costUsd was reported as 0. The fix
// persists costUsd into the cache entry so a cache hit returns the original
// (cold-invocation) cost. These tests cover the persistence round-trip
// without invoking the haiku model — the failure surface lives in the
// cache layer.

// Use a temp prefix on `targetRepo` so the cache files land in a unique
// sub-tree under the (gitignored) `state/triage/` dir and don't collide
// across parallel test runs. The test sweeps its own writes on the way
// out.
function uniqueTargetRepo(): string {
  const id = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `vp-test-${id}/repo`;
}

async function rmCacheDir(targetRepo: string): Promise<void> {
  const dir = path.join(TRIAGE_DIR, targetRepo.replace("/", "__"));
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}

test("triage cache: writeCache persists costUsd; readCache surfaces it on hit", async () => {
  const targetRepo = uniqueTargetRepo();
  try {
    const contentHash = "sha256:abc123";
    await __testInternals.writeCache(
      targetRepo,
      42,
      contentHash,
      { ready: true, reason: "concrete bug with repro" },
      0.0241,
    );
    const cached = await __testInternals.readCache(targetRepo, 42, contentHash);
    assert.ok(cached, "cache hit expected");
    assert.equal(cached!.result.ready, true);
    assert.equal(cached!.costUsd, 0.0241);
  } finally {
    await rmCacheDir(targetRepo);
  }
});

test("triage cache: contentHash mismatch yields cache miss (null)", async () => {
  const targetRepo = uniqueTargetRepo();
  try {
    await __testInternals.writeCache(
      targetRepo,
      99,
      "sha256:original",
      { ready: false, reason: "ambiguous scope" },
      0.0182,
    );
    const cached = await __testInternals.readCache(targetRepo, 99, "sha256:DIFFERENT");
    assert.equal(cached, null, "stale cache should miss when contentHash drifts");
  } finally {
    await rmCacheDir(targetRepo);
  }
});

test("triage cache: legacy entry without costUsd field reads back as costUsd: 0", async () => {
  // Forward-compat: caches written by pre-#137 versions of vp-dev have no
  // `costUsd` field. A cache hit on those entries must NOT crash; it should
  // degrade to 0 (the prior behavior). Once the issue is re-triaged after
  // the fix, the new value is persisted and subsequent hits return it.
  const targetRepo = uniqueTargetRepo();
  try {
    const contentHash = "sha256:legacy";
    const filePath = __testInternals.cacheFilePath(targetRepo, 7);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    // Hand-craft a legacy entry: no costUsd field.
    const legacy = {
      targetRepo,
      issueNumber: 7,
      contentHash,
      result: { ready: true, reason: "legacy entry" },
      triagedAt: new Date().toISOString(),
    };
    await fs.writeFile(filePath, JSON.stringify(legacy, null, 2));

    const cached = await __testInternals.readCache(targetRepo, 7, contentHash);
    assert.ok(cached, "legacy cache hit expected");
    assert.equal(cached!.result.ready, true);
    assert.equal(cached!.costUsd, 0, "missing costUsd degrades to 0");
  } finally {
    await rmCacheDir(targetRepo);
  }
});

test("triage cache: round-trip determinism — sequential reads return identical costUsd", async () => {
  // The "Plan diverged" bug surface: --plan writes cache with cost X, then
  // --confirm re-runs triageBatch which hits the cache and returns the same
  // X. This test models that round-trip directly.
  const targetRepo = uniqueTargetRepo();
  try {
    const contentHash = "sha256:roundtrip";
    const originalCost = 0.0241;
    await __testInternals.writeCache(
      targetRepo,
      137,
      contentHash,
      { ready: true, reason: "explicit acceptance criteria" },
      originalCost,
    );
    const first = await __testInternals.readCache(targetRepo, 137, contentHash);
    const second = await __testInternals.readCache(targetRepo, 137, contentHash);
    assert.ok(first && second);
    assert.equal(first!.costUsd, originalCost);
    assert.equal(second!.costUsd, originalCost);
    // The two reads MUST return the same number — this is what makes the
    // gate-text `Triage cost:` line deterministic between --plan and --confirm.
    assert.equal(first!.costUsd, second!.costUsd);
  } finally {
    await rmCacheDir(targetRepo);
  }
});

test("triage cache: malformed JSON file returns null without throwing", async () => {
  const targetRepo = uniqueTargetRepo();
  try {
    const filePath = __testInternals.cacheFilePath(targetRepo, 1);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "not valid json {");
    const cached = await __testInternals.readCache(targetRepo, 1, "sha256:any");
    assert.equal(cached, null);
  } finally {
    await rmCacheDir(targetRepo);
  }
});

// Touch `os` import to avoid a "declared but unused" lint complaint if a
// later refactor switches to os.tmpdir() — it's not used today because
// TRIAGE_DIR is process.cwd()-rooted, so we stay there for parity with
// real runs.
void os.platform;
