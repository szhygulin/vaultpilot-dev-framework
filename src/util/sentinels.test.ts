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
  extractLegacySentinelTags,
  formatSentinelHeader,
  parseSentinelHeader,
  resolveExpireK,
  resolveExpiryPolicies,
  type ExpiryPolicy,
  type SentinelHeader,
} from "./sentinels.js";

test("parseSentinelHeader: tagless sentinel", () => {
  const h = parseSentinelHeader(
    "<!-- run:run-1 issue:#42 outcome:failure-lesson ts:2026-05-01T00:00:00.000Z -->",
  );
  assert.deepEqual(h, {
    runId: "run-1",
    issueId: 42,
    outcome: "failure-lesson",
    ts: "2026-05-01T00:00:00.000Z",
  });
});

test("parseSentinelHeader: legacy `tags:` is silently tolerated and dropped from header", () => {
  const h = parseSentinelHeader(
    "<!-- run:run-1 issue:#42 outcome:implement ts:2026-05-02T00:00:00.000Z tags:auth,refactor -->",
  );
  assert.deepEqual(h, {
    runId: "run-1",
    issueId: 42,
    outcome: "implement",
    ts: "2026-05-02T00:00:00.000Z",
  });
});

test("extractLegacySentinelTags: extracts tags from legacy line for migration", () => {
  assert.deepEqual(
    extractLegacySentinelTags(
      "<!-- run:run-1 issue:#42 outcome:implement ts:2026-05-02T00:00:00.000Z tags:auth,refactor -->",
    ),
    ["auth", "refactor"],
  );
  assert.deepEqual(
    extractLegacySentinelTags(
      "<!-- run:run-1 issue:#42 outcome:implement ts:2026-05-02T00:00:00.000Z -->",
    ),
    [],
  );
  assert.deepEqual(extractLegacySentinelTags("not a sentinel"), []);
});

test("parseSentinelHeader: non-sentinel line returns null", () => {
  assert.equal(parseSentinelHeader("## Some heading"), null);
  assert.equal(parseSentinelHeader("body text"), null);
  assert.equal(parseSentinelHeader(""), null);
});

test("formatSentinelHeader: emits no `tags:` field", () => {
  const line = formatSentinelHeader({
    runId: "run-X",
    issueId: 7,
    outcome: "failure-lesson",
    ts: "2026-05-01T00:00:00.000Z",
  });
  assert.equal(
    line,
    "<!-- run:run-X issue:#7 outcome:failure-lesson ts:2026-05-01T00:00:00.000Z -->",
  );
  const parsed = parseSentinelHeader(line);
  assert.deepEqual(parsed, {
    runId: "run-X",
    issueId: 7,
    outcome: "failure-lesson",
    ts: "2026-05-01T00:00:00.000Z",
  });
});

// Helper: each header gets tags from a `tags` array parallel to the header
// list. Mirrors how callers (`specialization.ts`) build tagsByIndex from the
// sidecar.
function header(
  outcome: string,
  i: number,
  tags?: string[],
): SentinelHeader & { _tags: string[] } {
  const h = {
    runId: `r${i}`,
    issueId: i,
    outcome,
    ts: `t${i}`,
  } as SentinelHeader & { _tags: string[] };
  h._tags = tags ?? [];
  return h;
}

function tagsOf(headers: Array<SentinelHeader & { _tags: string[] }>): string[][] {
  return headers.map((h) => h._tags);
}

test("decideExpiry: drops failure-lesson with K=3 overlapping implements", () => {
  const headers = [
    header("failure-lesson", 1, ["auth"]),
    header("implement", 2, ["auth"]),
    header("implement", 3, ["auth", "x"]),
    header("implement", 4, ["auth"]),
  ];
  const d = decideExpiry(headers, tagsOf(headers), 3);
  assert.deepEqual(d.drop, [0]);
});

test("decideExpiry: keeps failure-lesson with non-overlapping implements", () => {
  const headers = [
    header("failure-lesson", 1, ["auth"]),
    header("implement", 2, ["docs"]),
    header("implement", 3, ["docs"]),
    header("implement", 4, ["docs"]),
  ];
  const d = decideExpiry(headers, tagsOf(headers), 3);
  assert.deepEqual(d.drop, []);
});

test("decideExpiry: keeps failure-lesson with K-1 overlapping implements", () => {
  const headers = [
    header("failure-lesson", 1, ["auth"]),
    header("implement", 2, ["auth"]),
    header("implement", 3, ["auth"]),
  ];
  const d = decideExpiry(headers, tagsOf(headers), 3);
  assert.deepEqual(d.drop, []);
});

test("decideExpiry: pushback blocks don't count toward expiry", () => {
  const headers = [
    header("failure-lesson", 1, ["auth"]),
    header("implement", 2, ["auth"]),
    header("pushback", 3, ["auth"]),
    header("pushback", 4, ["auth"]),
  ];
  const d = decideExpiry(headers, tagsOf(headers), 3);
  assert.deepEqual(d.drop, []);
});

test("decideExpiry: candidate with empty tags is never dropped", () => {
  const headers = [
    header("failure-lesson", 1, []),
    header("implement", 2, ["auth"]),
    header("implement", 3, ["auth"]),
    header("implement", 4, ["auth"]),
  ];
  const d = decideExpiry(headers, tagsOf(headers), 3);
  assert.deepEqual(d.drop, []);
});

test("decideExpiry: only successes AFTER the lesson count", () => {
  const headers = [
    header("implement", 0, ["auth"]),
    header("implement", 1, ["auth"]),
    header("failure-lesson", 2, ["auth"]),
    header("implement", 3, ["auth"]),
  ];
  const d = decideExpiry(headers, tagsOf(headers), 3);
  assert.deepEqual(d.drop, []);
});

test("decideExpiry: K=0 disables expiry", () => {
  const headers = [
    header("failure-lesson", 1, ["auth"]),
    header("implement", 2, ["auth"]),
  ];
  const d = decideExpiry(headers, tagsOf(headers), 0);
  assert.deepEqual(d.drop, []);
});

// Helper: build a `getTags` callback by indexing a tags map by the header's
// issueId — works for tests where every issueId is unique. For tests that
// share issueIds across blocks (`compacted` outcomes), use a runId-keyed map.
function getTagsByIssueId(
  tagsByIssue: Record<number, string[]>,
): (h: SentinelHeader) => string[] {
  return (h: SentinelHeader): string[] => tagsByIssue[h.issueId] ?? [];
}

test("expireFailureLessonsInContent: drops block and is idempotent", () => {
  const content = [
    "# Agent CLAUDE.md",
    "",
    "Some prelude text.",
    "",
    "<!-- run:r1 issue:#1 outcome:failure-lesson ts:2026-05-01T00:00:00.000Z -->",
    "## Auth lesson",
    "",
    "Don't reuse session tokens.",
    "",
    "<!-- run:r2 issue:#2 outcome:implement ts:2026-05-02T00:00:00.000Z -->",
    "## Auth refactor 1",
    "",
    "Refactor body.",
    "",
    "<!-- run:r3 issue:#3 outcome:implement ts:2026-05-03T00:00:00.000Z -->",
    "## Auth refactor 2",
    "",
    "Refactor body.",
    "",
    "<!-- run:r4 issue:#4 outcome:implement ts:2026-05-04T00:00:00.000Z -->",
    "## Auth refactor 3",
    "",
    "Refactor body.",
    "",
  ].join("\n");
  const tagsByIssue = { 1: ["auth"], 2: ["auth"], 3: ["auth"], 4: ["auth"] };
  const getTags = getTagsByIssueId(tagsByIssue);

  const r1 = expireFailureLessonsInContent(content, 3, getTags);
  assert.equal(r1.droppedHeaders.length, 1);
  assert.equal(r1.droppedHeaders[0].outcome, "failure-lesson");
  assert.ok(!r1.content.includes("Auth lesson"));
  assert.ok(r1.content.includes("Auth refactor 1"));
  assert.ok(r1.content.includes("Auth refactor 2"));
  assert.ok(r1.content.includes("Auth refactor 3"));
  assert.ok(r1.content.startsWith("# Agent CLAUDE.md\n"));
  assert.ok(r1.content.includes("Some prelude text."));

  const r2 = expireFailureLessonsInContent(r1.content, 3, getTags);
  assert.equal(r2.droppedHeaders.length, 0);
  assert.equal(r2.content, r1.content);
});

test("expireFailureLessonsInContent: preserves non-overlapping lesson", () => {
  const content = [
    "# Agent CLAUDE.md",
    "",
    "<!-- run:r1 issue:#1 outcome:failure-lesson ts:2026-05-01T00:00:00.000Z -->",
    "## Auth lesson",
    "",
    "Don't reuse session tokens.",
    "",
    "<!-- run:r2 issue:#2 outcome:implement ts:2026-05-02T00:00:00.000Z -->",
    "## Docs typo 1",
    "",
    "Body.",
    "",
    "<!-- run:r3 issue:#3 outcome:implement ts:2026-05-03T00:00:00.000Z -->",
    "## Docs typo 2",
    "",
    "Body.",
    "",
    "<!-- run:r4 issue:#4 outcome:implement ts:2026-05-04T00:00:00.000Z -->",
    "## Docs typo 3",
    "",
    "Body.",
    "",
  ].join("\n");
  const getTags = getTagsByIssueId({
    1: ["auth"],
    2: ["docs"],
    3: ["docs"],
    4: ["docs"],
  });

  const r = expireFailureLessonsInContent(content, 3, getTags);
  assert.equal(r.droppedHeaders.length, 0);
  assert.equal(r.content, content);
});

test("expireFailureLessonsInContent: empty / sentinel-free content is a no-op", () => {
  const empty = "";
  const getTags = getTagsByIssueId({});
  const r1 = expireFailureLessonsInContent(empty, 3, getTags);
  assert.equal(r1.content, empty);
  assert.equal(r1.droppedHeaders.length, 0);

  const noSentinels = "# Heading\n\nSome body.\n";
  const r2 = expireFailureLessonsInContent(noSentinels, 3, getTags);
  assert.equal(r2.content, noSentinels);
  assert.equal(r2.droppedHeaders.length, 0);
});

test("expireFailureLessonsInContent: drops only the lesson, not the success blocks", () => {
  const content = [
    "<!-- run:r1 issue:#1 outcome:failure-lesson ts:t1 -->",
    "## Lesson",
    "",
    "L body.",
    "",
    "<!-- run:r2 issue:#2 outcome:implement ts:t2 -->",
    "## Success 1",
    "",
    "S body.",
    "",
    "<!-- run:r3 issue:#3 outcome:implement ts:t3 -->",
    "## Success 2",
    "",
    "S body.",
    "",
    "<!-- run:r4 issue:#4 outcome:implement ts:t4 -->",
    "## Success 3",
    "",
    "S body.",
    "",
  ].join("\n");
  const getTags = getTagsByIssueId({
    1: ["auth"],
    2: ["auth"],
    3: ["auth"],
    4: ["auth"],
  });

  const r = expireFailureLessonsInContent(content, 3, getTags);
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
  const headers = Array.from({ length: 6 }, (_, i) => header("implement", i, ["auth"]));
  const d = decideExpiryWithPolicies(headers, tagsOf(headers), [successPolicy]);
  assert.deepEqual(d.drop, [0]);
});

test("decideExpiryWithPolicies: keeps success when Jaccard < 0.5", () => {
  const headers = [
    header("implement", 0, ["auth"]),
    header("implement", 1, ["auth", "x", "y", "z"]),
    header("implement", 2, ["auth", "x", "y", "z"]),
    header("implement", 3, ["auth", "x", "y", "z"]),
    header("implement", 4, ["auth", "x", "y", "z"]),
    header("implement", 5, ["auth", "x", "y", "z"]),
  ];
  const d = decideExpiryWithPolicies(headers, tagsOf(headers), [successPolicy]);
  assert.deepEqual(d.drop, []);
});

test("decideExpiryWithPolicies: Jaccard ≥ 0.5 with overlap of 1/2 boundary", () => {
  const headers = Array.from({ length: 6 }, (_, i) =>
    header("implement", i, ["a", "b"]),
  );
  const d = decideExpiryWithPolicies(headers, tagsOf(headers), [successPolicy]);
  assert.deepEqual(d.drop, [0]);
});

test("decideExpiryWithPolicies: Jaccard exactly 0.5 dropped (boundary inclusive)", () => {
  const headers = [
    header("implement", 0, ["a"]),
    header("implement", 1, ["a", "b"]),
    header("implement", 2, ["a", "b"]),
    header("implement", 3, ["a", "b"]),
    header("implement", 4, ["a", "b"]),
    header("implement", 5, ["a", "b"]),
  ];
  const d = decideExpiryWithPolicies(headers, tagsOf(headers), [successPolicy]);
  assert.deepEqual(d.drop, [0]);
});

test("decideExpiryWithPolicies: pushback default policy preserves all", () => {
  const headers = Array.from({ length: 10 }, (_, i) =>
    header("pushback", i, ["scope-creep"]),
  );
  const d = decideExpiryWithPolicies(headers, tagsOf(headers), [
    pushbackPreservePolicy,
  ]);
  assert.deepEqual(d.drop, []);
});

test("decideExpiryWithPolicies: pushback with finite K does drop overlapping", () => {
  const headers = Array.from({ length: 5 }, (_, i) =>
    header("pushback", i, ["scope-creep"]),
  );
  const finitePushback: ExpiryPolicy = {
    kind: "pushback",
    k: 3,
    supersededBy: ["pushback"],
    overlap: { mode: "any-shared-tag" },
  };
  const d = decideExpiryWithPolicies(headers, tagsOf(headers), [finitePushback]);
  assert.deepEqual(d.drop, [0, 1]);
});

test("decideExpiryWithPolicies: candidate with empty tags is never dropped", () => {
  const headers = [
    header("implement", 0, []),
    ...Array.from({ length: 5 }, (_, i) => header("implement", i + 1, ["auth"])),
  ];
  const d = decideExpiryWithPolicies(headers, tagsOf(headers), [successPolicy]);
  assert.deepEqual(d.drop, []);
});

test("decideExpiryWithPolicies: combined policies preserve cross-kind boundaries", () => {
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
  const headers = [
    header("failure-lesson", 0, ["auth"]),
    header("implement", 1, ["auth"]),
    header("implement", 2, ["auth"]),
    header("implement", 3, ["auth"]),
    header("pushback", 4, ["scope"]),
    header("pushback", 5, ["scope"]),
  ];
  const d = decideExpiryWithPolicies(headers, tagsOf(headers), policies);
  assert.deepEqual(d.drop, [0]);
});

test("expireSentinelsInContent: drops superseded success block, idempotent", () => {
  const content = [
    "# Agent CLAUDE.md",
    "",
    "<!-- run:r0 issue:#0 outcome:implement ts:2026-05-01T00:00:00.000Z -->",
    "## Auth lesson 0",
    "",
    "Body 0.",
    "",
    "<!-- run:r1 issue:#1 outcome:implement ts:2026-05-02T00:00:00.000Z -->",
    "## Auth lesson 1",
    "",
    "Body 1.",
    "",
    "<!-- run:r2 issue:#2 outcome:implement ts:2026-05-03T00:00:00.000Z -->",
    "## Auth lesson 2",
    "",
    "Body 2.",
    "",
    "<!-- run:r3 issue:#3 outcome:implement ts:2026-05-04T00:00:00.000Z -->",
    "## Auth lesson 3",
    "",
    "Body 3.",
    "",
    "<!-- run:r4 issue:#4 outcome:implement ts:2026-05-05T00:00:00.000Z -->",
    "## Auth lesson 4",
    "",
    "Body 4.",
    "",
    "<!-- run:r5 issue:#5 outcome:implement ts:2026-05-06T00:00:00.000Z -->",
    "## Auth lesson 5",
    "",
    "Body 5.",
    "",
  ].join("\n");
  const getTags = getTagsByIssueId({
    0: ["auth"],
    1: ["auth"],
    2: ["auth"],
    3: ["auth"],
    4: ["auth"],
    5: ["auth"],
  });

  const r1 = expireSentinelsInContent(content, [successPolicy], getTags);
  assert.equal(r1.droppedHeaders.length, 1);
  assert.equal(r1.droppedHeaders[0].issueId, 0);
  assert.ok(!r1.content.includes("## Auth lesson 0"));
  assert.ok(r1.content.includes("## Auth lesson 1"));
  assert.ok(r1.content.includes("## Auth lesson 5"));

  const r2 = expireSentinelsInContent(r1.content, [successPolicy], getTags);
  assert.equal(r2.droppedHeaders.length, 0);
  assert.equal(r2.content, r1.content);
});

test("expireSentinelsInContent: pushback default policy preserves the file", () => {
  const content = [
    "# Agent CLAUDE.md",
    "",
    "<!-- run:r1 issue:#1 outcome:pushback ts:t1 -->",
    "## P1",
    "",
    "<!-- run:r2 issue:#2 outcome:pushback ts:t2 -->",
    "## P2",
    "",
    "<!-- run:r3 issue:#3 outcome:pushback ts:t3 -->",
    "## P3",
    "",
    "<!-- run:r4 issue:#4 outcome:pushback ts:t4 -->",
    "## P4",
    "",
  ].join("\n");
  const getTags = getTagsByIssueId({ 1: ["scope"], 2: ["scope"], 3: ["scope"], 4: ["scope"] });

  const r = expireSentinelsInContent(content, [pushbackPreservePolicy], getTags);
  assert.equal(r.droppedHeaders.length, 0);
  assert.equal(r.content, content);
});

test("expireFailureLessonsInContent: still works as a thin wrapper", () => {
  const content = [
    "<!-- run:r1 issue:#1 outcome:failure-lesson ts:t1 -->",
    "## L",
    "",
    "<!-- run:r2 issue:#2 outcome:implement ts:t2 -->",
    "## S1",
    "",
    "<!-- run:r3 issue:#3 outcome:implement ts:t3 -->",
    "## S2",
    "",
    "<!-- run:r4 issue:#4 outcome:implement ts:t4 -->",
    "## S3",
    "",
  ].join("\n");
  const getTags = getTagsByIssueId({
    1: ["auth"],
    2: ["auth"],
    3: ["auth"],
    4: ["auth"],
  });
  const r = expireFailureLessonsInContent(content, 3, getTags);
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
