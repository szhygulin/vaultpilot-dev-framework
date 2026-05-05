import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { __testInternals, DEDUP_DIR, parseDedupResponse } from "./dedup.js";
import type { IssueDetail } from "../github/gh.js";
import type { DuplicateCluster } from "../types.js";

// Tests for issue #156 — "Plan diverged" recurrence on first --confirm
// caused by the dedup pass re-running between --plan and --confirm with
// no caching. Mirrors `triage.test.ts` (issue #137): the failure surface
// is the cache layer, so the round-trip is exercised here without an
// Opus call in the loop.

function uniqueTargetRepo(): string {
  const id = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `vp-test-${id}/repo`;
}

async function rmCacheFile(targetRepo: string): Promise<void> {
  const file = path.join(DEDUP_DIR, `${targetRepo.replace("/", "__")}.json`);
  await fs.rm(file, { force: true }).catch(() => {});
}

const sampleClusters: DuplicateCluster[] = [
  {
    canonical: 100,
    duplicates: [101, 102],
    rationale: "all three issues request the same render-block; #100 has the longest body.",
  },
];

function makeIssue(id: number, body: string): IssueDetail {
  return {
    id,
    title: `Issue ${id}`,
    state: "open",
    labels: [],
    body,
    comments: [],
  };
}

test("dedup cache: writeCache persists clusters + costUsd; readCache surfaces them on hit", async () => {
  const targetRepo = uniqueTargetRepo();
  try {
    const contentHash = "sha256:abc123";
    await __testInternals.writeCache(targetRepo, contentHash, sampleClusters, 0.0251);
    const cached = await __testInternals.readCache(targetRepo, contentHash);
    assert.ok(cached, "cache hit expected");
    assert.equal(cached!.costUsd, 0.0251);
    assert.equal(cached!.clusters.length, 1);
    assert.equal(cached!.clusters[0].canonical, 100);
    assert.deepEqual(cached!.clusters[0].duplicates, [101, 102]);
  } finally {
    await rmCacheFile(targetRepo);
  }
});

test("dedup cache: contentHash mismatch yields cache miss (null)", async () => {
  const targetRepo = uniqueTargetRepo();
  try {
    await __testInternals.writeCache(targetRepo, "sha256:original", sampleClusters, 0.04);
    const cached = await __testInternals.readCache(targetRepo, "sha256:DIFFERENT");
    assert.equal(cached, null, "stale cache should miss when contentHash drifts");
  } finally {
    await rmCacheFile(targetRepo);
  }
});

test("dedup cache: legacy entry without costUsd field reads back as 0", async () => {
  // Forward-compat with cache files written before #156 — a hand-crafted
  // legacy entry must NOT crash readCache; it should degrade to costUsd: 0.
  const targetRepo = uniqueTargetRepo();
  try {
    const contentHash = "sha256:legacy";
    const filePath = __testInternals.cacheFilePath(targetRepo);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const legacy = {
      targetRepo,
      contentHash,
      clusters: sampleClusters,
      detectedAt: new Date().toISOString(),
    };
    await fs.writeFile(filePath, JSON.stringify(legacy, null, 2));
    const cached = await __testInternals.readCache(targetRepo, contentHash);
    assert.ok(cached, "legacy cache hit expected");
    assert.equal(cached!.costUsd, 0, "missing costUsd degrades to 0");
    assert.equal(cached!.clusters.length, 1);
  } finally {
    await rmCacheFile(targetRepo);
  }
});

test("dedup cache: round-trip determinism — sequential reads return identical costUsd", async () => {
  // The "Plan diverged" surface: --plan writes cache with cost X, then
  // --confirm re-runs detectDuplicates which hits the cache and returns
  // the same X. This test models that round-trip directly.
  const targetRepo = uniqueTargetRepo();
  try {
    const contentHash = "sha256:roundtrip";
    const originalCost = 0.0251;
    await __testInternals.writeCache(targetRepo, contentHash, sampleClusters, originalCost);
    const first = await __testInternals.readCache(targetRepo, contentHash);
    const second = await __testInternals.readCache(targetRepo, contentHash);
    assert.ok(first && second);
    assert.equal(first!.costUsd, originalCost);
    assert.equal(second!.costUsd, originalCost);
    // The two reads MUST return the same number — this is what makes
    // the gate-text `Dedup cost:` line deterministic between --plan and
    // --confirm.
    assert.equal(first!.costUsd, second!.costUsd);
    // And the cluster set must be identical too — when --apply-dedup is
    // active, drift here would silently close a different set of
    // duplicates on confirm than the user saw at plan time.
    assert.deepEqual(first!.clusters, second!.clusters);
  } finally {
    await rmCacheFile(targetRepo);
  }
});

test("dedup cache: malformed JSON file returns null without throwing", async () => {
  const targetRepo = uniqueTargetRepo();
  try {
    const filePath = __testInternals.cacheFilePath(targetRepo);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "not valid json {");
    const cached = await __testInternals.readCache(targetRepo, "sha256:any");
    assert.equal(cached, null);
  } finally {
    await rmCacheFile(targetRepo);
  }
});

test("dedup cache: cluster shape validation drops corrupted file (returns null)", async () => {
  // A cache file whose cluster array fails Zod validation must NOT
  // smuggle an invalid shape back into the orchestrator — the read
  // must miss so the next call re-runs the model.
  const targetRepo = uniqueTargetRepo();
  try {
    const contentHash = "sha256:corrupt";
    const filePath = __testInternals.cacheFilePath(targetRepo);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const corrupt = {
      targetRepo,
      contentHash,
      // Missing required fields on the cluster entry.
      clusters: [{ canonical: -5 /* not positive */, duplicates: [], rationale: "" }],
      costUsd: 0.01,
      detectedAt: new Date().toISOString(),
    };
    await fs.writeFile(filePath, JSON.stringify(corrupt, null, 2));
    const cached = await __testInternals.readCache(targetRepo, contentHash);
    assert.equal(cached, null);
  } finally {
    await rmCacheFile(targetRepo);
  }
});

test("dedup contentHash: identical inputs in different order yield same hash", async () => {
  // The model is order-insensitive when clustering; the cache must be
  // too. Without sorting, a re-fetched issue list whose order shifted
  // (gh ordering is not strictly stable) would miss the cache.
  const a = makeIssue(1, "alpha body");
  const b = makeIssue(2, "beta body");
  const c = makeIssue(3, "gamma body");
  const h1 = __testInternals.computeContentHash([a, b, c]);
  const h2 = __testInternals.computeContentHash([c, a, b]);
  const h3 = __testInternals.computeContentHash([b, c, a]);
  assert.equal(h1, h2);
  assert.equal(h1, h3);
});

test("dedup contentHash: body edit on one issue invalidates the hash", async () => {
  // The cache MUST invalidate when an issue's body changes — otherwise
  // a stale verdict survives across edits.
  const a = makeIssue(1, "original body");
  const b = makeIssue(2, "second body");
  const aPrime = makeIssue(1, "edited body");
  const before = __testInternals.computeContentHash([a, b]);
  const after = __testInternals.computeContentHash([aPrime, b]);
  assert.notEqual(before, after);
});

test("dedup contentHash: dropping an issue from the candidate set invalidates the hash", async () => {
  // The dispatch list shrinking (e.g. one issue closes between --plan
  // and --confirm, or triage flips a verdict) must invalidate the
  // cache — the input batch is genuinely different.
  const a = makeIssue(1, "alpha");
  const b = makeIssue(2, "beta");
  const c = makeIssue(3, "gamma");
  const full = __testInternals.computeContentHash([a, b, c]);
  const trimmed = __testInternals.computeContentHash([a, b]);
  assert.notEqual(full, trimmed);
});

// Smoke test that parseDedupResponse still works (round-trip from
// pre-#156 behavior) — the cache layer is layered ABOVE this helper, so
// any regression in parsing would still show up here.
test("dedup parseDedupResponse: still parses a fenced JSON response", () => {
  const raw = '```json\n{"clusters": [{"canonical": 5, "duplicates": [6, 7], "rationale": "all three describe the same crash."}]}\n```';
  const parsed = parseDedupResponse(raw, new Set([5, 6, 7]));
  assert.ok(parsed);
  assert.equal(parsed!.length, 1);
  assert.equal(parsed![0].canonical, 5);
});
