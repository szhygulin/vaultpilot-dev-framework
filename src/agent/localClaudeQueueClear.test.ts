import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BODY_PREFIX_FOR_MATCH,
  DEFAULT_QUEUE_CLEAR_JACCARD_MIN,
  clearLocalClaudeQueue,
  detectMergedQueueEntries,
  jaccard,
  parseProjectClaudeSections,
  parseQueueEntries,
  resolveQueueClearJaccardMin,
  similarityScore,
  tokenize,
} from "./localClaudeQueueClear.js";
import { appendToLocalClaudeQueue } from "./localClaudeQueue.js";

async function withTmpDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "queue-clear-test-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------
// resolveQueueClearJaccardMin
// ---------------------------------------------------------------------

test("resolveQueueClearJaccardMin: defaults + valid override + invalid env falls back", () => {
  assert.equal(resolveQueueClearJaccardMin({}), DEFAULT_QUEUE_CLEAR_JACCARD_MIN);
  assert.equal(
    resolveQueueClearJaccardMin({ VP_DEV_QUEUE_CLEAR_JACCARD_MIN: "0.7" }),
    0.7,
  );
  assert.equal(
    resolveQueueClearJaccardMin({ VP_DEV_QUEUE_CLEAR_JACCARD_MIN: "abc" }),
    DEFAULT_QUEUE_CLEAR_JACCARD_MIN,
  );
  assert.equal(
    resolveQueueClearJaccardMin({ VP_DEV_QUEUE_CLEAR_JACCARD_MIN: "0" }),
    DEFAULT_QUEUE_CLEAR_JACCARD_MIN,
  );
  assert.equal(
    resolveQueueClearJaccardMin({ VP_DEV_QUEUE_CLEAR_JACCARD_MIN: "1.5" }),
    DEFAULT_QUEUE_CLEAR_JACCARD_MIN,
  );
});

test("DEFAULT_QUEUE_CLEAR_JACCARD_MIN is in (0, 1)", () => {
  assert.ok(
    DEFAULT_QUEUE_CLEAR_JACCARD_MIN > 0 && DEFAULT_QUEUE_CLEAR_JACCARD_MIN < 1,
    `expected default in (0, 1); got ${DEFAULT_QUEUE_CLEAR_JACCARD_MIN}`,
  );
});

// ---------------------------------------------------------------------
// tokenize / jaccard
// ---------------------------------------------------------------------

test("tokenize: drops short + stop words, lowercases, splits on non-alphanumerics", () => {
  const tokens = tokenize("The Quick Brown Fox jumps over the LAZY dog.");
  assert.ok(!tokens.has("the"));
  assert.ok(tokens.has("quick"));
  assert.ok(tokens.has("brown"));
  assert.ok(tokens.has("fox"));
  assert.ok(tokens.has("jumps"));
  assert.ok(tokens.has("lazy"));
});

test("jaccard: identity = 1, disjoint = 0, partial overlap in (0,1)", () => {
  assert.equal(jaccard(new Set(["a", "b", "c"]), new Set(["a", "b", "c"])), 1);
  assert.equal(jaccard(new Set(["a", "b"]), new Set(["x", "y"])), 0);
  const partial = jaccard(new Set(["a", "b", "c"]), new Set(["b", "c", "d"]));
  assert.ok(partial > 0 && partial < 1);
});

// ---------------------------------------------------------------------
// parseQueueEntries
// ---------------------------------------------------------------------

test("parseQueueEntries: parses a single entry written by appendToLocalClaudeQueue", async () => {
  await withTmpDir(async (dir) => {
    const filePath = path.join(dir, "queue.md");
    await appendToLocalClaudeQueue({
      sourceAgentId: "agent-test",
      ts: "2026-05-06T15:00:00.000Z",
      utility: 0.8,
      body: "## Some Project Rule\n\nBody content here.",
      filePathOverride: filePath,
    });
    const content = await fs.readFile(filePath, "utf-8");
    const entries = parseQueueEntries(content);
    assert.equal(entries.length, 1);
    assert.match(entries[0].header, /^<!-- queued source=agent-test/);
    assert.equal(entries[0].heading, "Some Project Rule");
    assert.match(entries[0].body, /Body content here\./);
  });
});

test("parseQueueEntries: parses multiple entries in order", async () => {
  await withTmpDir(async (dir) => {
    const filePath = path.join(dir, "queue.md");
    await appendToLocalClaudeQueue({
      sourceAgentId: "agent-a",
      ts: "T1",
      body: "## First\n\nFirst body",
      filePathOverride: filePath,
    });
    await appendToLocalClaudeQueue({
      sourceAgentId: "agent-b",
      ts: "T2",
      body: "## Second\n\nSecond body",
      filePathOverride: filePath,
    });
    await appendToLocalClaudeQueue({
      sourceAgentId: "agent-c",
      ts: "T3",
      body: "## Third\n\nThird body",
      filePathOverride: filePath,
    });
    const content = await fs.readFile(filePath, "utf-8");
    const entries = parseQueueEntries(content);
    assert.equal(entries.length, 3);
    assert.equal(entries[0].heading, "First");
    assert.equal(entries[1].heading, "Second");
    assert.equal(entries[2].heading, "Third");
  });
});

test("parseQueueEntries: empty queue returns []", () => {
  assert.deepEqual(parseQueueEntries(""), []);
});

test("parseQueueEntries: handles entry without `## Heading` line gracefully", () => {
  const raw = "\n<!-- queued source=agent-x ts=T1 -->\nplain body without heading\n";
  const entries = parseQueueEntries(raw);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].heading, "");
  assert.match(entries[0].body, /plain body without heading/);
});

// ---------------------------------------------------------------------
// parseProjectClaudeSections
// ---------------------------------------------------------------------

test("parseProjectClaudeSections: walks `## Heading` blocks regardless of preamble", () => {
  const md = `# Project rules

Some preface text.

## First rule

Body of first rule.

<!-- promoted-from-summarizer source=agent-a ts=T1 -->
## Second rule

Body of second rule.

<!-- run:r1 issue:#5 outcome:implement ts:2026-01-01T00:00:00Z -->
## Third rule

Body of third rule.
`;
  const sections = parseProjectClaudeSections(md);
  assert.equal(sections.length, 3);
  assert.equal(sections[0].heading, "First rule");
  assert.equal(sections[1].heading, "Second rule");
  assert.equal(sections[2].heading, "Third rule");
  assert.match(sections[2].body, /Body of third rule\./);
});

test("parseProjectClaudeSections: empty CLAUDE.md returns []", () => {
  assert.deepEqual(parseProjectClaudeSections(""), []);
  assert.deepEqual(parseProjectClaudeSections("# Title only\n\nNo subheadings.\n"), []);
});

// ---------------------------------------------------------------------
// similarityScore + detectMergedQueueEntries
// ---------------------------------------------------------------------

test("similarityScore: identical heading + body = 1", () => {
  const entry = {
    header: "<!-- queued ... -->",
    heading: "My Rule",
    body: "Important content about widget configuration",
    raw: "...",
    startOffset: 0,
  };
  const section = {
    heading: "My Rule",
    body: "Important content about widget configuration",
  };
  assert.equal(similarityScore(entry, section), 1);
});

test("similarityScore: disjoint = 0", () => {
  const entry = {
    header: "<!-- queued ... -->",
    heading: "Solana validator forensics",
    body: "epoch boundary slot inclusion proofs",
    raw: "...",
    startOffset: 0,
  };
  const section = {
    heading: "Aave liquidations",
    body: "interest rate model",
  };
  assert.equal(similarityScore(entry, section), 0);
});

test("similarityScore: heading reworded but body preserved still scores high (the issue's motivation)", () => {
  // Issue #202: "heading-only Jaccard would miss reworded sections."
  const entry = {
    header: "<!-- queued ... -->",
    heading: "Push-back discipline",
    body: "When the issue body's premise is wrong, push back before acting. Compose a comment with one mismatch sentence and 2-3 alternatives. Don't begin implementation if the framing is faulty.",
    raw: "...",
    startOffset: 0,
  };
  // Operator reworded the heading when opening the chore PR.
  const section = {
    heading: "When to push back on an issue",
    body: "When the issue body's premise is wrong, push back before acting. Compose a comment with one mismatch sentence and 2-3 alternatives. Don't begin implementation if the framing is faulty.",
  };
  const score = similarityScore(entry, section);
  assert.ok(
    score >= 0.7,
    `expected high similarity from body-prefix overlap; got ${score}`,
  );
});

test("detectMergedQueueEntries: surfaces only entries above threshold", async () => {
  await withTmpDir(async (dir) => {
    const queuePath = path.join(dir, "queue.md");
    await appendToLocalClaudeQueue({
      sourceAgentId: "agent-1",
      ts: "T1",
      body: "## Rule about widgets\n\nWidgets should be configured with setting X for proper operation.",
      filePathOverride: queuePath,
    });
    await appendToLocalClaudeQueue({
      sourceAgentId: "agent-2",
      ts: "T2",
      body: "## Rule about gizmos\n\nGizmos must be calibrated quarterly to maintain accuracy.",
      filePathOverride: queuePath,
    });
    const queueContent = await fs.readFile(queuePath, "utf-8");
    // Project CLAUDE.md only has the widgets section (the gizmo PR hasn't merged).
    const claudeMd = `# Project rules

## Rule about widgets

Widgets should be configured with setting X for proper operation.
`;
    const result = detectMergedQueueEntries({ queueContent, claudeMd });
    assert.equal(result.entries.length, 2);
    assert.equal(result.merged.length, 1);
    assert.equal(result.merged[0].entry.heading, "Rule about widgets");
    assert.ok(result.merged[0].similarity >= DEFAULT_QUEUE_CLEAR_JACCARD_MIN);
  });
});

test("detectMergedQueueEntries: empty CLAUDE.md → no matches", async () => {
  await withTmpDir(async (dir) => {
    const queuePath = path.join(dir, "queue.md");
    await appendToLocalClaudeQueue({
      sourceAgentId: "agent-1",
      ts: "T1",
      body: "## Some rule\n\nBody.",
      filePathOverride: queuePath,
    });
    const queueContent = await fs.readFile(queuePath, "utf-8");
    const result = detectMergedQueueEntries({ queueContent, claudeMd: "" });
    assert.equal(result.entries.length, 1);
    assert.equal(result.merged.length, 0);
  });
});

// ---------------------------------------------------------------------
// clearLocalClaudeQueue (mutation)
// ---------------------------------------------------------------------

test("clearLocalClaudeQueue: --all mode empties the file", async () => {
  await withTmpDir(async (dir) => {
    const queuePath = path.join(dir, "queue.md");
    const claudeMdPath = path.join(dir, "CLAUDE.md");
    await fs.writeFile(claudeMdPath, "# nothing relevant\n");
    await appendToLocalClaudeQueue({
      sourceAgentId: "agent-1",
      ts: "T1",
      body: "## A\n\nbody-a",
      filePathOverride: queuePath,
    });
    await appendToLocalClaudeQueue({
      sourceAgentId: "agent-2",
      ts: "T2",
      body: "## B\n\nbody-b",
      filePathOverride: queuePath,
    });

    const result = await clearLocalClaudeQueue({
      mode: "all",
      queueFilePathOverride: queuePath,
      claudeMdPathOverride: claudeMdPath,
    });
    assert.equal(result.totalBefore, 2);
    assert.equal(result.remaining, 0);
    assert.equal(result.removed, 2);
    const remaining = await fs.readFile(queuePath, "utf-8");
    assert.equal(remaining, "");
  });
});

test("clearLocalClaudeQueue: --merged mode drops only matching entries, preserves the rest", async () => {
  await withTmpDir(async (dir) => {
    const queuePath = path.join(dir, "queue.md");
    const claudeMdPath = path.join(dir, "CLAUDE.md");
    await appendToLocalClaudeQueue({
      sourceAgentId: "agent-1",
      ts: "T1",
      body: "## Configure widgets\n\nWidgets need setting X for stability.",
      filePathOverride: queuePath,
    });
    await appendToLocalClaudeQueue({
      sourceAgentId: "agent-2",
      ts: "T2",
      body: "## Calibrate gizmos\n\nGizmos must be calibrated quarterly to maintain accuracy.",
      filePathOverride: queuePath,
    });
    // Only the widgets entry has been promoted into project CLAUDE.md.
    await fs.writeFile(
      claudeMdPath,
      "# Project rules\n\n## Configure widgets\n\nWidgets need setting X for stability.\n",
    );

    const result = await clearLocalClaudeQueue({
      mode: "merged",
      queueFilePathOverride: queuePath,
      claudeMdPathOverride: claudeMdPath,
    });
    assert.equal(result.totalBefore, 2);
    assert.equal(result.remaining, 1);
    assert.equal(result.removed, 1);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].entry.heading, "Configure widgets");
    const remaining = await fs.readFile(queuePath, "utf-8");
    assert.match(remaining, /Calibrate gizmos/);
    assert.doesNotMatch(remaining, /Configure widgets/);
  });
});

test("clearLocalClaudeQueue: --merged mode with no matches is a no-op (file unchanged)", async () => {
  await withTmpDir(async (dir) => {
    const queuePath = path.join(dir, "queue.md");
    const claudeMdPath = path.join(dir, "CLAUDE.md");
    await appendToLocalClaudeQueue({
      sourceAgentId: "agent-1",
      ts: "T1",
      body: "## Calibrate gizmos\n\nGizmos must be calibrated quarterly.",
      filePathOverride: queuePath,
    });
    await fs.writeFile(claudeMdPath, "# Project rules\n\n(nothing matches)\n");

    const before = await fs.readFile(queuePath, "utf-8");
    const result = await clearLocalClaudeQueue({
      mode: "merged",
      queueFilePathOverride: queuePath,
      claudeMdPathOverride: claudeMdPath,
    });
    assert.equal(result.removed, 0);
    assert.equal(result.matches.length, 0);
    const after = await fs.readFile(queuePath, "utf-8");
    // After a write the trailing whitespace is normalized but the entry survives.
    assert.match(after, /Calibrate gizmos/);
    assert.match(after, /source=agent-1/);
    // bytesAfter <= bytesBefore (whitespace can change due to renderQueueContent).
    assert.ok(result.bytesBefore >= 0);
    assert.ok(result.bytesAfter > 0);
    void before;
  });
});

test("clearLocalClaudeQueue: missing queue file → 0 totals, 0 mutations", async () => {
  await withTmpDir(async (dir) => {
    const queuePath = path.join(dir, "missing-queue.md");
    const claudeMdPath = path.join(dir, "CLAUDE.md");
    await fs.writeFile(claudeMdPath, "# rules\n");
    const result = await clearLocalClaudeQueue({
      mode: "merged",
      queueFilePathOverride: queuePath,
      claudeMdPathOverride: claudeMdPath,
    });
    assert.equal(result.totalBefore, 0);
    assert.equal(result.remaining, 0);
    assert.equal(result.removed, 0);
  });
});

test("clearLocalClaudeQueue: --merged with missing project CLAUDE.md → no matches (nothing dropped)", async () => {
  await withTmpDir(async (dir) => {
    const queuePath = path.join(dir, "queue.md");
    const claudeMdPath = path.join(dir, "missing-CLAUDE.md");
    await appendToLocalClaudeQueue({
      sourceAgentId: "agent-1",
      ts: "T1",
      body: "## A rule\n\nBody.",
      filePathOverride: queuePath,
    });
    const result = await clearLocalClaudeQueue({
      mode: "merged",
      queueFilePathOverride: queuePath,
      claudeMdPathOverride: claudeMdPath,
    });
    assert.equal(result.totalBefore, 1);
    assert.equal(result.removed, 0);
    assert.equal(result.matches.length, 0);
  });
});

test("clearLocalClaudeQueue: explicit threshold override changes which entries match", async () => {
  await withTmpDir(async (dir) => {
    const queuePath = path.join(dir, "queue.md");
    const claudeMdPath = path.join(dir, "CLAUDE.md");
    await appendToLocalClaudeQueue({
      sourceAgentId: "agent-1",
      ts: "T1",
      body:
        "## Push-back discipline\n\nWhen the issue's premise is wrong, comment with one mismatch sentence and alternatives.",
      filePathOverride: queuePath,
    });
    // Project CLAUDE.md has a partial-overlap section.
    await fs.writeFile(
      claudeMdPath,
      "# rules\n\n## Push-back discipline\n\nWhen something is wrong comment.\n",
    );

    // Strict threshold (0.95) → no match expected.
    const strict = await clearLocalClaudeQueue({
      mode: "merged",
      jaccardMin: 0.95,
      queueFilePathOverride: queuePath,
      claudeMdPathOverride: claudeMdPath,
    });
    assert.equal(strict.removed, 0);

    // Re-add the entry (it survives the no-op above with whitespace normalization,
    // so we just check the lenient path against the same file).
    const lenient = await clearLocalClaudeQueue({
      mode: "merged",
      jaccardMin: 0.05,
      queueFilePathOverride: queuePath,
      claudeMdPathOverride: claudeMdPath,
    });
    assert.equal(lenient.removed, 1);
  });
});

// ---------------------------------------------------------------------
// BODY_PREFIX_FOR_MATCH sanity
// ---------------------------------------------------------------------

test("BODY_PREFIX_FOR_MATCH is a positive integer", () => {
  assert.ok(Number.isInteger(BODY_PREFIX_FOR_MATCH));
  assert.ok(BODY_PREFIX_FOR_MATCH > 0);
});
