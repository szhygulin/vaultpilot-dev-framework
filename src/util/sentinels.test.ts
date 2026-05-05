import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FAILURE_LESSON_EXPIRE_K,
  DEFAULT_PUSHBACK_LESSON_EXPIRE_K,
  DEFAULT_SUCCESS_LESSON_EXPIRE_K,
  decideExpiry,
  decideExpiryWithPolicies,
  expireFailureLessonsInContent,
  expireSentinelsInContent,
  formatSentinelHeader,
  parseSentinelHeader,
  resolveExpireK,
  resolveExpiryPolicies,
  type ExpiryPolicy,
} from "./sentinels.js";

test("parseSentinelHeader: legacy sentinel without tags", () => {
  const h = parseSentinelHeader(
    "<!-- run:run-1 issue:#42 outcome:failure-lesson ts:2026-05-01T00:00:00.000Z -->",
  );
  assert.notEqual(h, null);
  assert.deepEqual(h, {
    runId: "run-1",
    issueId: 42,
    outcome: "failure-lesson",
    ts: "2026-05-01T00:00:00.000Z",
    tags: [],
  });
});

test("parseSentinelHeader: sentinel with tags", () => {
  const h = parseSentinelHeader(
    "<!-- run:run-1 issue:#42 outcome:implement ts:2026-05-02T00:00:00.000Z tags:auth,refactor -->",
  );
  assert.notEqual(h, null);
  assert.deepEqual(h?.tags, ["auth", "refactor"]);
  assert.equal(h?.outcome, "implement");
});

test("parseSentinelHeader: non-sentinel line returns null", () => {
  assert.equal(parseSentinelHeader("## Some heading"), null);
  assert.equal(parseSentinelHeader("body text"), null);
  assert.equal(parseSentinelHeader(""), null);
});

test("formatSentinelHeader: round-trip", () => {
  const line = formatSentinelHeader({
    runId: "run-X",
    issueId: 7,
    outcome: "failure-lesson",
    ts: "2026-05-01T00:00:00.000Z",
    tags: ["b", "a"],
  });
  // Tags are sorted at format time for stable output.
  assert.equal(
    line,
    "<!-- run:run-X issue:#7 outcome:failure-lesson ts:2026-05-01T00:00:00.000Z tags:a,b -->",
  );
  const parsed = parseSentinelHeader(line);
  assert.deepEqual(parsed?.tags, ["a", "b"]);
});

test("decideExpiry: drops failure-lesson with K=3 overlapping implements", () => {
  const headers = [
    {
      runId: "r1",
      issueId: 1,
      outcome: "failure-lesson",
      ts: "t1",
      tags: ["auth"],
    },
    { runId: "r2", issueId: 2, outcome: "implement", ts: "t2", tags: ["auth"] },
    {
      runId: "r3",
      issueId: 3,
      outcome: "implement",
      ts: "t3",
      tags: ["auth", "x"],
    },
    { runId: "r4", issueId: 4, outcome: "implement", ts: "t4", tags: ["auth"] },
  ];
  const d = decideExpiry(headers, 3);
  assert.deepEqual(d.drop, [0]);
});

test("decideExpiry: keeps failure-lesson with non-overlapping implements", () => {
  const headers = [
    {
      runId: "r1",
      issueId: 1,
      outcome: "failure-lesson",
      ts: "t1",
      tags: ["auth"],
    },
    { runId: "r2", issueId: 2, outcome: "implement", ts: "t2", tags: ["docs"] },
    { runId: "r3", issueId: 3, outcome: "implement", ts: "t3", tags: ["docs"] },
    { runId: "r4", issueId: 4, outcome: "implement", ts: "t4", tags: ["docs"] },
  ];
  const d = decideExpiry(headers, 3);
  assert.deepEqual(d.drop, []);
});

test("decideExpiry: keeps failure-lesson with K-1 overlapping implements", () => {
  const headers = [
    {
      runId: "r1",
      issueId: 1,
      outcome: "failure-lesson",
      ts: "t1",
      tags: ["auth"],
    },
    { runId: "r2", issueId: 2, outcome: "implement", ts: "t2", tags: ["auth"] },
    { runId: "r3", issueId: 3, outcome: "implement", ts: "t3", tags: ["auth"] },
  ];
  const d = decideExpiry(headers, 3);
  assert.deepEqual(d.drop, []);
});

test("decideExpiry: pushback blocks don't count toward expiry", () => {
  const headers = [
    {
      runId: "r1",
      issueId: 1,
      outcome: "failure-lesson",
      ts: "t1",
      tags: ["auth"],
    },
    { runId: "r2", issueId: 2, outcome: "implement", ts: "t2", tags: ["auth"] },
    { runId: "r3", issueId: 3, outcome: "pushback", ts: "t3", tags: ["auth"] },
    { runId: "r4", issueId: 4, outcome: "pushback", ts: "t4", tags: ["auth"] },
  ];
  const d = decideExpiry(headers, 3);
  assert.deepEqual(d.drop, []);
});

test("decideExpiry: legacy failure-lesson without tags is never dropped", () => {
  const headers = [
    {
      runId: "r1",
      issueId: 1,
      outcome: "failure-lesson",
      ts: "t1",
      tags: [],
    },
    { runId: "r2", issueId: 2, outcome: "implement", ts: "t2", tags: ["auth"] },
    { runId: "r3", issueId: 3, outcome: "implement", ts: "t3", tags: ["auth"] },
    { runId: "r4", issueId: 4, outcome: "implement", ts: "t4", tags: ["auth"] },
  ];
  const d = decideExpiry(headers, 3);
  assert.deepEqual(d.drop, []);
});

test("decideExpiry: only successes AFTER the lesson count", () => {
  const headers = [
    { runId: "r0", issueId: 0, outcome: "implement", ts: "t0", tags: ["auth"] },
    { runId: "r1", issueId: 1, outcome: "implement", ts: "t1", tags: ["auth"] },
    {
      runId: "r2",
      issueId: 2,
      outcome: "failure-lesson",
      ts: "t2",
      tags: ["auth"],
    },
    { runId: "r3", issueId: 3, outcome: "implement", ts: "t3", tags: ["auth"] },
  ];
  const d = decideExpiry(headers, 3);
  // Only one subsequent implement → keep.
  assert.deepEqual(d.drop, []);
});

test("decideExpiry: K=0 disables expiry", () => {
  const headers = [
    {
      runId: "r1",
      issueId: 1,
      outcome: "failure-lesson",
      ts: "t1",
      tags: ["auth"],
    },
    { runId: "r2", issueId: 2, outcome: "implement", ts: "t2", tags: ["auth"] },
  ];
  const d = decideExpiry(headers, 0);
  assert.deepEqual(d.drop, []);
});

test("expireFailureLessonsInContent: drops block and is idempotent", () => {
  const content = [
    "# Agent CLAUDE.md",
    "",
    "Some prelude text.",
    "",
    "<!-- run:r1 issue:#1 outcome:failure-lesson ts:2026-05-01T00:00:00.000Z tags:auth -->",
    "## Auth lesson",
    "",
    "Don't reuse session tokens.",
    "",
    "<!-- run:r2 issue:#2 outcome:implement ts:2026-05-02T00:00:00.000Z tags:auth -->",
    "## Auth refactor 1",
    "",
    "Refactor body.",
    "",
    "<!-- run:r3 issue:#3 outcome:implement ts:2026-05-03T00:00:00.000Z tags:auth -->",
    "## Auth refactor 2",
    "",
    "Refactor body.",
    "",
    "<!-- run:r4 issue:#4 outcome:implement ts:2026-05-04T00:00:00.000Z tags:auth -->",
    "## Auth refactor 3",
    "",
    "Refactor body.",
    "",
  ].join("\n");

  const r1 = expireFailureLessonsInContent(content, 3);
  assert.equal(r1.droppedHeaders.length, 1);
  assert.equal(r1.droppedHeaders[0].outcome, "failure-lesson");
  assert.ok(!r1.content.includes("Auth lesson"));
  assert.ok(r1.content.includes("Auth refactor 1"));
  assert.ok(r1.content.includes("Auth refactor 2"));
  assert.ok(r1.content.includes("Auth refactor 3"));
  // Prelude must be preserved.
  assert.ok(r1.content.startsWith("# Agent CLAUDE.md\n"));
  assert.ok(r1.content.includes("Some prelude text."));

  // Idempotent: re-applying changes nothing.
  const r2 = expireFailureLessonsInContent(r1.content, 3);
  assert.equal(r2.droppedHeaders.length, 0);
  assert.equal(r2.content, r1.content);
});

test("expireFailureLessonsInContent: preserves non-overlapping lesson", () => {
  const content = [
    "# Agent CLAUDE.md",
    "",
    "<!-- run:r1 issue:#1 outcome:failure-lesson ts:2026-05-01T00:00:00.000Z tags:auth -->",
    "## Auth lesson",
    "",
    "Don't reuse session tokens.",
    "",
    "<!-- run:r2 issue:#2 outcome:implement ts:2026-05-02T00:00:00.000Z tags:docs -->",
    "## Docs typo 1",
    "",
    "Body.",
    "",
    "<!-- run:r3 issue:#3 outcome:implement ts:2026-05-03T00:00:00.000Z tags:docs -->",
    "## Docs typo 2",
    "",
    "Body.",
    "",
    "<!-- run:r4 issue:#4 outcome:implement ts:2026-05-04T00:00:00.000Z tags:docs -->",
    "## Docs typo 3",
    "",
    "Body.",
    "",
  ].join("\n");

  const r = expireFailureLessonsInContent(content, 3);
  assert.equal(r.droppedHeaders.length, 0);
  assert.equal(r.content, content);
});

test("expireFailureLessonsInContent: empty / sentinel-free content is a no-op", () => {
  const empty = "";
  const r1 = expireFailureLessonsInContent(empty, 3);
  assert.equal(r1.content, empty);
  assert.equal(r1.droppedHeaders.length, 0);

  const noSentinels = "# Heading\n\nSome body.\n";
  const r2 = expireFailureLessonsInContent(noSentinels, 3);
  assert.equal(r2.content, noSentinels);
  assert.equal(r2.droppedHeaders.length, 0);
});

test("expireFailureLessonsInContent: drops only the lesson, not the success blocks", () => {
  const content = [
    "<!-- run:r1 issue:#1 outcome:failure-lesson ts:t1 tags:auth -->",
    "## Lesson",
    "",
    "L body.",
    "",
    "<!-- run:r2 issue:#2 outcome:implement ts:t2 tags:auth -->",
    "## Success 1",
    "",
    "S body.",
    "",
    "<!-- run:r3 issue:#3 outcome:implement ts:t3 tags:auth -->",
    "## Success 2",
    "",
    "S body.",
    "",
    "<!-- run:r4 issue:#4 outcome:implement ts:t4 tags:auth -->",
    "## Success 3",
    "",
    "S body.",
    "",
  ].join("\n");

  const r = expireFailureLessonsInContent(content, 3);
  assert.equal(r.droppedHeaders.length, 1);
  assert.ok(!r.content.includes("## Lesson"));
  assert.ok(r.content.includes("## Success 1"));
  assert.ok(r.content.includes("## Success 2"));
  assert.ok(r.content.includes("## Success 3"));
});

test("resolveExpireK: default when env unset", () => {
  assert.equal(resolveExpireK({}), DEFAULT_FAILURE_LESSON_EXPIRE_K);
});

test("resolveExpireK: parses env override", () => {
  assert.equal(resolveExpireK({ VP_DEV_FAILURE_LESSON_EXPIRE_K: "5" }), 5);
});

test("resolveExpireK: falls back on garbage", () => {
  assert.equal(
    resolveExpireK({ VP_DEV_FAILURE_LESSON_EXPIRE_K: "abc" }),
    DEFAULT_FAILURE_LESSON_EXPIRE_K,
  );
  assert.equal(
    resolveExpireK({ VP_DEV_FAILURE_LESSON_EXPIRE_K: "0" }),
    DEFAULT_FAILURE_LESSON_EXPIRE_K,
  );
  assert.equal(
    resolveExpireK({ VP_DEV_FAILURE_LESSON_EXPIRE_K: "-2" }),
    DEFAULT_FAILURE_LESSON_EXPIRE_K,
  );
});

// ── Generalized per-kind expiry ────────────────────────────────────────

const successPolicy: ExpiryPolicy = {
  kind: "implement",
  k: 5,
  supersededBy: ["implement"],
  overlap: { mode: "jaccard", minScore: 0.5 },
};

const pushbackPreservePolicy: ExpiryPolicy = {
  kind: "pushback",
  k: Number.POSITIVE_INFINITY,
  supersededBy: ["pushback"],
  overlap: { mode: "any-shared-tag" },
};

test("decideExpiryWithPolicies: drops success with K newer high-Jaccard implements", () => {
  // 5 newer implements all sharing tags ["auth"] (Jaccard 1.0 with first).
  const headers = Array.from({ length: 6 }, (_, i) => ({
    runId: `r${i}`,
    issueId: i,
    outcome: "implement",
    ts: `t${i}`,
    tags: ["auth"],
  }));
  const d = decideExpiryWithPolicies(headers, [successPolicy]);
  // Only the very first block has 5 newer; later blocks have <5.
  assert.deepEqual(d.drop, [0]);
});

test("decideExpiryWithPolicies: keeps success when Jaccard < 0.5", () => {
  // Candidate ["auth"]; successors ["auth","x","y","z"] → Jaccard
  // 1/4 = 0.25, below threshold.
  const headers: Parameters<typeof decideExpiryWithPolicies>[0] = [
    { runId: "r0", issueId: 0, outcome: "implement", ts: "t0", tags: ["auth"] },
    {
      runId: "r1",
      issueId: 1,
      outcome: "implement",
      ts: "t1",
      tags: ["auth", "x", "y", "z"],
    },
    {
      runId: "r2",
      issueId: 2,
      outcome: "implement",
      ts: "t2",
      tags: ["auth", "x", "y", "z"],
    },
    {
      runId: "r3",
      issueId: 3,
      outcome: "implement",
      ts: "t3",
      tags: ["auth", "x", "y", "z"],
    },
    {
      runId: "r4",
      issueId: 4,
      outcome: "implement",
      ts: "t4",
      tags: ["auth", "x", "y", "z"],
    },
    {
      runId: "r5",
      issueId: 5,
      outcome: "implement",
      ts: "t5",
      tags: ["auth", "x", "y", "z"],
    },
  ];
  const d = decideExpiryWithPolicies(headers, [successPolicy]);
  assert.deepEqual(d.drop, []);
});

test("decideExpiryWithPolicies: Jaccard ≥ 0.5 with overlap of 1/2 boundary", () => {
  // Candidate ["a","b"]; successors each ["a","b"] (Jaccard 1.0).
  const headers = Array.from({ length: 6 }, (_, i) => ({
    runId: `r${i}`,
    issueId: i,
    outcome: "implement",
    ts: `t${i}`,
    tags: ["a", "b"],
  }));
  const d = decideExpiryWithPolicies(headers, [successPolicy]);
  assert.deepEqual(d.drop, [0]);
});

test("decideExpiryWithPolicies: Jaccard exactly 0.5 dropped (boundary inclusive)", () => {
  // Candidate ["a","b"]; successors ["a","b","c"] → Jaccard 2/3 ≈ 0.67 ✓.
  // Candidate ["a","b"]; successors ["a","c"] → Jaccard 1/3 ≈ 0.33 ✗.
  // For exact 0.5: candidate ["a"]; successor ["a","b"] → 1/2 = 0.5.
  const headers: Parameters<typeof decideExpiryWithPolicies>[0] = [
    { runId: "r0", issueId: 0, outcome: "implement", ts: "t0", tags: ["a"] },
    {
      runId: "r1",
      issueId: 1,
      outcome: "implement",
      ts: "t1",
      tags: ["a", "b"],
    },
    {
      runId: "r2",
      issueId: 2,
      outcome: "implement",
      ts: "t2",
      tags: ["a", "b"],
    },
    {
      runId: "r3",
      issueId: 3,
      outcome: "implement",
      ts: "t3",
      tags: ["a", "b"],
    },
    {
      runId: "r4",
      issueId: 4,
      outcome: "implement",
      ts: "t4",
      tags: ["a", "b"],
    },
    {
      runId: "r5",
      issueId: 5,
      outcome: "implement",
      ts: "t5",
      tags: ["a", "b"],
    },
  ];
  const d = decideExpiryWithPolicies(headers, [successPolicy]);
  assert.deepEqual(d.drop, [0]);
});

test("decideExpiryWithPolicies: pushback default policy preserves all", () => {
  const headers = Array.from({ length: 10 }, (_, i) => ({
    runId: `r${i}`,
    issueId: i,
    outcome: "pushback",
    ts: `t${i}`,
    tags: ["scope-creep"],
  }));
  const d = decideExpiryWithPolicies(headers, [pushbackPreservePolicy]);
  assert.deepEqual(d.drop, []);
});

test("decideExpiryWithPolicies: pushback with finite K does drop overlapping", () => {
  const headers = Array.from({ length: 5 }, (_, i) => ({
    runId: `r${i}`,
    issueId: i,
    outcome: "pushback",
    ts: `t${i}`,
    tags: ["scope-creep"],
  }));
  const finitePushback: ExpiryPolicy = {
    kind: "pushback",
    k: 3,
    supersededBy: ["pushback"],
    overlap: { mode: "any-shared-tag" },
  };
  const d = decideExpiryWithPolicies(headers, [finitePushback]);
  // Indices 0 and 1 each have ≥ 3 newer overlapping pushbacks.
  assert.deepEqual(d.drop, [0, 1]);
});

test("decideExpiryWithPolicies: legacy implement without tags is never dropped", () => {
  const headers = [
    { runId: "r0", issueId: 0, outcome: "implement", ts: "t0", tags: [] },
    ...Array.from({ length: 5 }, (_, i) => ({
      runId: `r${i + 1}`,
      issueId: i + 1,
      outcome: "implement",
      ts: `t${i + 1}`,
      tags: ["auth"],
    })),
  ];
  const d = decideExpiryWithPolicies(headers, [successPolicy]);
  assert.deepEqual(d.drop, []);
});

test("decideExpiryWithPolicies: combined policies preserve cross-kind boundaries", () => {
  // failure-lesson with overlapping successes → drop.
  // success block in same domain is the supersession source, NOT a candidate.
  // pushback block with overlapping pushbacks (K=Infinity) → keep.
  const policies: ExpiryPolicy[] = [
    {
      kind: "failure-lesson",
      k: 3,
      supersededBy: ["implement"],
      overlap: { mode: "any-shared-tag" },
    },
    successPolicy,
    pushbackPreservePolicy,
  ];
  const headers: Parameters<typeof decideExpiryWithPolicies>[0] = [
    {
      runId: "r0",
      issueId: 0,
      outcome: "failure-lesson",
      ts: "t0",
      tags: ["auth"],
    },
    { runId: "r1", issueId: 1, outcome: "implement", ts: "t1", tags: ["auth"] },
    { runId: "r2", issueId: 2, outcome: "implement", ts: "t2", tags: ["auth"] },
    { runId: "r3", issueId: 3, outcome: "implement", ts: "t3", tags: ["auth"] },
    {
      runId: "r4",
      issueId: 4,
      outcome: "pushback",
      ts: "t4",
      tags: ["scope"],
    },
    {
      runId: "r5",
      issueId: 5,
      outcome: "pushback",
      ts: "t5",
      tags: ["scope"],
    },
  ];
  const d = decideExpiryWithPolicies(headers, policies);
  // Only the failure-lesson at index 0 should be dropped.
  // Implements at 1/2 don't have ≥5 newer; pushbacks preserved.
  assert.deepEqual(d.drop, [0]);
});

test("expireSentinelsInContent: drops superseded success block, idempotent", () => {
  const content = [
    "# Agent CLAUDE.md",
    "",
    "<!-- run:r0 issue:#0 outcome:implement ts:2026-05-01T00:00:00.000Z tags:auth -->",
    "## Auth lesson 0",
    "",
    "Body 0.",
    "",
    "<!-- run:r1 issue:#1 outcome:implement ts:2026-05-02T00:00:00.000Z tags:auth -->",
    "## Auth lesson 1",
    "",
    "Body 1.",
    "",
    "<!-- run:r2 issue:#2 outcome:implement ts:2026-05-03T00:00:00.000Z tags:auth -->",
    "## Auth lesson 2",
    "",
    "Body 2.",
    "",
    "<!-- run:r3 issue:#3 outcome:implement ts:2026-05-04T00:00:00.000Z tags:auth -->",
    "## Auth lesson 3",
    "",
    "Body 3.",
    "",
    "<!-- run:r4 issue:#4 outcome:implement ts:2026-05-05T00:00:00.000Z tags:auth -->",
    "## Auth lesson 4",
    "",
    "Body 4.",
    "",
    "<!-- run:r5 issue:#5 outcome:implement ts:2026-05-06T00:00:00.000Z tags:auth -->",
    "## Auth lesson 5",
    "",
    "Body 5.",
    "",
  ].join("\n");

  const r1 = expireSentinelsInContent(content, [successPolicy]);
  // Block 0 has 5 newer high-Jaccard implements → drop.
  assert.equal(r1.droppedHeaders.length, 1);
  assert.equal(r1.droppedHeaders[0].issueId, 0);
  assert.ok(!r1.content.includes("## Auth lesson 0"));
  assert.ok(r1.content.includes("## Auth lesson 1"));
  assert.ok(r1.content.includes("## Auth lesson 5"));

  // Idempotent.
  const r2 = expireSentinelsInContent(r1.content, [successPolicy]);
  assert.equal(r2.droppedHeaders.length, 0);
  assert.equal(r2.content, r1.content);
});

test("expireSentinelsInContent: pushback default policy preserves the file", () => {
  const content = [
    "# Agent CLAUDE.md",
    "",
    "<!-- run:r1 issue:#1 outcome:pushback ts:t1 tags:scope -->",
    "## P1",
    "",
    "<!-- run:r2 issue:#2 outcome:pushback ts:t2 tags:scope -->",
    "## P2",
    "",
    "<!-- run:r3 issue:#3 outcome:pushback ts:t3 tags:scope -->",
    "## P3",
    "",
    "<!-- run:r4 issue:#4 outcome:pushback ts:t4 tags:scope -->",
    "## P4",
    "",
  ].join("\n");

  const r = expireSentinelsInContent(content, [pushbackPreservePolicy]);
  assert.equal(r.droppedHeaders.length, 0);
  assert.equal(r.content, content);
});

test("expireFailureLessonsInContent: still works as a thin wrapper", () => {
  // Original behavior: failure-lesson with 3 overlapping implements → drop.
  const content = [
    "<!-- run:r1 issue:#1 outcome:failure-lesson ts:t1 tags:auth -->",
    "## L",
    "",
    "<!-- run:r2 issue:#2 outcome:implement ts:t2 tags:auth -->",
    "## S1",
    "",
    "<!-- run:r3 issue:#3 outcome:implement ts:t3 tags:auth -->",
    "## S2",
    "",
    "<!-- run:r4 issue:#4 outcome:implement ts:t4 tags:auth -->",
    "## S3",
    "",
  ].join("\n");
  const r = expireFailureLessonsInContent(content, 3);
  assert.equal(r.droppedHeaders.length, 1);
  assert.equal(r.droppedHeaders[0].outcome, "failure-lesson");
});

test("resolveExpiryPolicies: defaults", () => {
  const policies = resolveExpiryPolicies({});
  const failure = policies.find((p) => p.kind === "failure-lesson");
  const success = policies.find((p) => p.kind === "implement");
  const pushback = policies.find((p) => p.kind === "pushback");
  assert.equal(failure?.k, DEFAULT_FAILURE_LESSON_EXPIRE_K);
  assert.equal(success?.k, DEFAULT_SUCCESS_LESSON_EXPIRE_K);
  assert.equal(pushback?.k, DEFAULT_PUSHBACK_LESSON_EXPIRE_K);
  assert.equal(pushback?.k, Number.POSITIVE_INFINITY);
  assert.deepEqual(success?.overlap, { mode: "jaccard", minScore: 0.5 });
});

test("resolveExpiryPolicies: env overrides", () => {
  const policies = resolveExpiryPolicies({
    VP_DEV_FAILURE_LESSON_EXPIRE_K: "2",
    VP_DEV_SUCCESS_LESSON_EXPIRE_K: "10",
    VP_DEV_PUSHBACK_LESSON_EXPIRE_K: "4",
  });
  assert.equal(policies.find((p) => p.kind === "failure-lesson")?.k, 2);
  assert.equal(policies.find((p) => p.kind === "implement")?.k, 10);
  assert.equal(policies.find((p) => p.kind === "pushback")?.k, 4);
});

test("resolveExpiryPolicies: pushback explicit disable strings", () => {
  for (const v of ["off", "disabled", "infinity", "Infinity", "INFINITY"]) {
    const policies = resolveExpiryPolicies({
      VP_DEV_PUSHBACK_LESSON_EXPIRE_K: v,
    });
    assert.equal(
      policies.find((p) => p.kind === "pushback")?.k,
      Number.POSITIVE_INFINITY,
    );
  }
});

test("resolveExpiryPolicies: pushback garbage falls back to default Infinity", () => {
  const policies = resolveExpiryPolicies({
    VP_DEV_PUSHBACK_LESSON_EXPIRE_K: "garbage",
  });
  assert.equal(
    policies.find((p) => p.kind === "pushback")?.k,
    DEFAULT_PUSHBACK_LESSON_EXPIRE_K,
  );
});
