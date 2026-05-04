import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FAILURE_LESSON_EXPIRE_K,
  decideExpiry,
  expireFailureLessonsInContent,
  formatSentinelHeader,
  parseSentinelHeader,
  resolveExpireK,
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
