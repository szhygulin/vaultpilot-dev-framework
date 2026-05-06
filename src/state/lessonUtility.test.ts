import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import {
  deriveStableSectionId,
  extractCitedStableIds,
  extractPastIncidentDates,
  lessonUtilityPath,
  loadLessonUtility,
  recordIntroduction,
  recordMergeHistory,
  recordPushback,
  recordReinforcement,
  resolveJaccardMin,
  DEFAULT_REINFORCEMENT_JACCARD_MIN,
  LESSON_UTILITY_SCHEMA_VERSION,
} from "./lessonUtility.js";

// STATE_DIR is captured at module-load via path.resolve(process.cwd(),
// "state"), so tests can't redirect by chdir. Instead each test uses a
// unique agentId (gitignored state file) and cleans up its own file on
// completion. Mirrors the pattern in runConfirm.test.ts.
let testCounter = 0;
async function withTestAgent<T>(
  fn: (agentId: string) => Promise<T>,
): Promise<T> {
  const agentId = `agent-test-${process.pid}-${++testCounter}`;
  try {
    return await fn(agentId);
  } finally {
    await fs.rm(lessonUtilityPath(agentId), { force: true });
    await fs.rm(`${lessonUtilityPath(agentId)}.lock`, { force: true });
  }
}

test("deriveStableSectionId: stable for same runId+issueId", () => {
  const a = deriveStableSectionId("run-2026-05-06T10-00-00Z", [42]);
  const b = deriveStableSectionId("run-2026-05-06T10-00-00Z", [42]);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("deriveStableSectionId: different runId produces different ID", () => {
  const a = deriveStableSectionId("run-A", [42]);
  const b = deriveStableSectionId("run-B", [42]);
  assert.notEqual(a, b);
});

test("deriveStableSectionId: compound issueIds produce sorted-stable hash (issue #162 shape)", () => {
  const a = deriveStableSectionId("run-X", [102, 100, 101]);
  const b = deriveStableSectionId("run-X", [100, 101, 102]);
  const c = deriveStableSectionId("run-X", [101, 102, 100]);
  assert.equal(a, b);
  assert.equal(b, c);
});

test("deriveStableSectionId: throws on empty issueIds", () => {
  assert.throws(() => deriveStableSectionId("run-X", []), /non-empty/);
});

test("extractPastIncidentDates: scrapes distinct ISO dates, sorted", () => {
  const body = "incident 2026-05-04, 2026-05-04 again, and 2026-04-29 earlier";
  assert.deepEqual(extractPastIncidentDates(body), ["2026-04-29", "2026-05-04"]);
});

test("extractPastIncidentDates: returns empty array when none present", () => {
  assert.deepEqual(extractPastIncidentDates("no dates here"), []);
});

test("recordIntroduction: creates a fresh record when file is absent", async () => {
  await withTestAgent(async (agentId) => {
    await recordIntroduction({
      agentId,
      runId: "run-1",
      issueId: 178,
      body: "saw this 2026-05-06",
      ts: "2026-05-06T10:00:00.000Z",
    });
    const file = await loadLessonUtility(agentId);
    assert.ok(file);
    assert.equal(file?.schemaVersion, LESSON_UTILITY_SCHEMA_VERSION);
    assert.equal(file?.sections.length, 1);
    const sec = file!.sections[0];
    assert.equal(sec.sectionId, deriveStableSectionId("run-1", [178]));
    assert.equal(sec.introducedRunId, "run-1");
    assert.deepEqual(sec.pastIncidentDates, ["2026-05-06"]);
    assert.equal(sec.crossReferenceCount, 0);
    assert.deepEqual(sec.reinforcementRuns, []);
  });
});

test("recordIntroduction: idempotent on the same stable ID, refreshes pastIncidentDates", async () => {
  await withTestAgent(async (agentId) => {
    await recordIntroduction({
      agentId,
      runId: "run-1",
      issueId: 178,
      body: "incident 2026-05-06",
      ts: "2026-05-06T10:00:00.000Z",
    });
    await recordIntroduction({
      agentId,
      runId: "run-1",
      issueId: 178,
      body: "incident 2026-05-06 and 2026-05-07",
      ts: "2026-05-06T11:00:00.000Z",
    });
    const file = await loadLessonUtility(agentId);
    assert.equal(file?.sections.length, 1);
    assert.deepEqual(file?.sections[0].pastIncidentDates, [
      "2026-05-06",
      "2026-05-07",
    ]);
    // introducedRunId / introducedAt do not change
    assert.equal(file?.sections[0].introducedAt, "2026-05-06T10:00:00.000Z");
  });
});

test("recordReinforcement: appends runId, dedups, stamps lastReinforcedAt", async () => {
  await withTestAgent(async (agentId) => {
    await recordIntroduction({
      agentId,
      runId: "run-1",
      issueId: 178,
      body: "",
      ts: "2026-05-06T10:00:00.000Z",
    });
    const target = deriveStableSectionId("run-1", [178]);
    await recordReinforcement({
      agentId,
      runId: "run-2",
      citedSectionStableIds: [target],
    });
    await recordReinforcement({
      agentId,
      runId: "run-2",
      citedSectionStableIds: [target],
    });
    const file = await loadLessonUtility(agentId);
    const sec = file!.sections.find((s) => s.sectionId === target)!;
    assert.deepEqual(sec.reinforcementRuns, ["run-2"]);
    assert.ok(sec.lastReinforcedAt);
  });
});

test("recordReinforcement: silently skips unknown stable IDs", async () => {
  await withTestAgent(async (agentId) => {
    await recordIntroduction({
      agentId,
      runId: "run-1",
      issueId: 178,
      body: "",
      ts: "2026-05-06T10:00:00.000Z",
    });
    await recordReinforcement({
      agentId,
      runId: "run-2",
      citedSectionStableIds: ["unknown-stable-id-zzz"],
    });
    const file = await loadLessonUtility(agentId);
    const sec = file!.sections[0];
    assert.deepEqual(sec.reinforcementRuns, []);
  });
});

test("recordReinforcement: empty citedSectionStableIds is a no-op (no file write)", async () => {
  await withTestAgent(async (agentId) => {
    await recordReinforcement({
      agentId,
      runId: "run-2",
      citedSectionStableIds: [],
    });
    const file = await loadLessonUtility(agentId);
    assert.equal(file, null);
  });
});

test("recordPushback: appends to pushbackRuns separately from reinforcementRuns", async () => {
  await withTestAgent(async (agentId) => {
    await recordIntroduction({
      agentId,
      runId: "run-1",
      issueId: 178,
      body: "",
      ts: "2026-05-06T10:00:00.000Z",
    });
    const target = deriveStableSectionId("run-1", [178]);
    await recordReinforcement({
      agentId,
      runId: "run-2",
      citedSectionStableIds: [target],
    });
    await recordPushback({
      agentId,
      runId: "run-3",
      citedSectionStableIds: [target],
    });
    const file = await loadLessonUtility(agentId);
    const sec = file!.sections[0];
    assert.deepEqual(sec.reinforcementRuns, ["run-2"]);
    assert.deepEqual(sec.pushbackRuns, ["run-3"]);
  });
});

test("recordMergeHistory: merges source records into a new merged stable ID", async () => {
  await withTestAgent(async (agentId) => {
    await recordIntroduction({
      agentId,
      runId: "run-A",
      issueId: 100,
      body: "incident 2026-04-01",
      ts: "2026-04-01T10:00:00.000Z",
    });
    await recordIntroduction({
      agentId,
      runId: "run-B",
      issueId: 101,
      body: "incident 2026-04-15",
      ts: "2026-04-15T10:00:00.000Z",
    });
    const idA = deriveStableSectionId("run-A", [100]);
    const idB = deriveStableSectionId("run-B", [101]);
    await recordReinforcement({
      agentId,
      runId: "run-C",
      citedSectionStableIds: [idA],
    });
    await recordPushback({
      agentId,
      runId: "run-D",
      citedSectionStableIds: [idB],
    });
    const merged = deriveStableSectionId("run-merge", [100, 101]);
    await recordMergeHistory({
      agentId,
      sourceStableIds: [idA, idB],
      mergedStableId: merged,
      mergedAt: "2026-05-06T12:00:00.000Z",
    });
    const file = await loadLessonUtility(agentId);
    assert.ok(file);
    assert.equal(file?.mergeHistory.length, 1);
    assert.deepEqual(
      [...(file?.mergeHistory[0].sourceStableIds ?? [])].sort(),
      [idA, idB].sort(),
    );
    const mergedSec = file!.sections.find((s) => s.sectionId === merged)!;
    assert.ok(mergedSec);
    assert.deepEqual(mergedSec.reinforcementRuns, ["run-C"]);
    assert.deepEqual(mergedSec.pushbackRuns, ["run-D"]);
    assert.deepEqual(mergedSec.pastIncidentDates, [
      "2026-04-01",
      "2026-04-15",
    ]);
  });
});

test("resolveJaccardMin: defaults when env unset", () => {
  assert.equal(resolveJaccardMin({}), DEFAULT_REINFORCEMENT_JACCARD_MIN);
});

test("resolveJaccardMin: parses valid (0,1] env values", () => {
  assert.equal(
    resolveJaccardMin({ VP_DEV_REINFORCEMENT_JACCARD_MIN: "0.5" }),
    0.5,
  );
});

test("resolveJaccardMin: falls back on invalid env values", () => {
  assert.equal(
    resolveJaccardMin({ VP_DEV_REINFORCEMENT_JACCARD_MIN: "garbage" }),
    DEFAULT_REINFORCEMENT_JACCARD_MIN,
  );
  assert.equal(
    resolveJaccardMin({ VP_DEV_REINFORCEMENT_JACCARD_MIN: "0" }),
    DEFAULT_REINFORCEMENT_JACCARD_MIN,
  );
  assert.equal(
    resolveJaccardMin({ VP_DEV_REINFORCEMENT_JACCARD_MIN: "1.5" }),
    DEFAULT_REINFORCEMENT_JACCARD_MIN,
  );
});

test("extractCitedStableIds: matches via Jaccard heading overlap above threshold", () => {
  const md = `
<!-- run:run-A issue:#100 outcome:implement ts:2026-04-01T10:00:00.000Z tags:cli-gate,cost-surface -->
## Some lesson about cost-surface CLI gates and approval

body line.
`;
  const cited = extractCitedStableIds({
    text: "approval flow tightened",
    heading: "Cost-surface CLI gate approval improvements",
    tags: ["cli-gate", "cost-surface"],
    claudeMd: md,
    jaccardMin: 0.2,
  });
  assert.equal(cited.length, 1);
  assert.equal(cited[0], deriveStableSectionId("run-A", [100]));
});

test("extractCitedStableIds: returns empty when no overlap above threshold", () => {
  const md = `
<!-- run:run-A issue:#100 outcome:implement ts:2026-04-01T10:00:00.000Z tags:foo -->
## Wholly unrelated lesson about widgets

body
`;
  const cited = extractCitedStableIds({
    text: "approval flow tightened",
    heading: "Cost-surface CLI gate approval improvements",
    tags: ["cli-gate", "cost-surface"],
    claudeMd: md,
    jaccardMin: 0.6,
  });
  assert.deepEqual(cited, []);
});

test("extractCitedStableIds: respects exclude set so a section never cites itself", () => {
  const md = `
<!-- run:run-A issue:#100 outcome:implement ts:2026-04-01T10:00:00.000Z tags:cli-gate -->
## Lesson about cli gate

body
`;
  const self = deriveStableSectionId("run-A", [100]);
  const cited = extractCitedStableIds({
    text: "lesson about cli gate body",
    heading: "Lesson about cli gate",
    claudeMd: md,
    jaccardMin: 0.1,
    exclude: new Set([self]),
  });
  assert.deepEqual(cited, []);
});

test("extractCitedStableIds: returns empty on a CLAUDE.md with no attributable sections", () => {
  const md = "# heading\n\nNo sentinels here.\n";
  const cited = extractCitedStableIds({
    text: "anything",
    heading: "anything",
    claudeMd: md,
  });
  assert.deepEqual(cited, []);
});

test("lessonUtilityPath is under STATE_DIR", () => {
  const p = lessonUtilityPath("agent-916a");
  assert.match(p, /state[\\/]lesson-utility-agent-916a\.json$/);
});
