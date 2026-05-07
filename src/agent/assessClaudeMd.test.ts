import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  composeUtility,
  formatAssessProposal,
  proposeAssessment,
  DEFAULT_KEEP_THRESHOLD,
  DEFAULT_DROP_THRESHOLD,
  DEFAULT_UTILITY_WEIGHTS,
  REINFORCEMENT_SATURATION,
} from "./assessClaudeMd.js";
import {
  deriveStableSectionId,
  type AgentUtilityFile,
  type SectionUtilityRecord,
  LESSON_UTILITY_SCHEMA_VERSION,
} from "../state/lessonUtility.js";
import { formatSentinelHeader } from "../util/sentinels.js";

// ---------------------------------------------------------------------------
// Test fixtures.
// ---------------------------------------------------------------------------

interface BlockSpec {
  runId: string;
  issueId: number;
  heading: string;
  body: string;
  ts: string;
}

function makeAgentClaudeMd(blocks: ReadonlyArray<BlockSpec>): string {
  const out: string[] = ["# Project rules", ""];
  for (const b of blocks) {
    out.push(
      formatSentinelHeader({
        runId: b.runId,
        issueId: b.issueId,
        outcome: "implement",
        ts: b.ts,
      }),
    );
    out.push(`## ${b.heading}`);
    out.push("");
    out.push(b.body);
    out.push("");
  }
  return out.join("\n");
}

async function withTempClaudeMd<T>(
  initialContent: string,
  fn: (filePath: string) => Promise<T>,
): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "assess-claude-md-test-"));
  const filePath = path.join(dir, "CLAUDE.md");
  await fs.writeFile(filePath, initialContent);
  try {
    return await fn(filePath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function makeRecord(
  partial: Partial<SectionUtilityRecord> & {
    sectionId: string;
    introducedRunId: string;
    introducedAt: string;
  },
): SectionUtilityRecord {
  return {
    reinforcementRuns: [],
    pushbackRuns: [],
    pastIncidentDates: [],
    crossReferenceCount: 0,
    ...partial,
  };
}

function makeFile(
  agentId: string,
  records: SectionUtilityRecord[],
): AgentUtilityFile {
  return {
    agentId,
    schemaVersion: LESSON_UTILITY_SCHEMA_VERSION,
    sections: records,
    mergeHistory: [],
  };
}

// ---------------------------------------------------------------------------
// composeUtility — pure unit tests for the weighted scoring.
// ---------------------------------------------------------------------------

test("composeUtility: zero-signal record yields utility 0", () => {
  const record = makeRecord({
    sectionId: "abc",
    introducedRunId: "run-A",
    introducedAt: "2026-04-01T00:00:00Z",
  });
  const { utility, breakdown } = composeUtility({
    record,
    now: new Date("2026-05-01T00:00:00Z"),
  });
  assert.equal(utility, 0);
  assert.equal(breakdown.reinforcement, 0);
  assert.equal(breakdown.pushback, 0);
  assert.equal(breakdown.recency, 0);
});

test("composeUtility: saturated reinforcement maxes that signal at 1", () => {
  const record = makeRecord({
    sectionId: "abc",
    introducedRunId: "run-A",
    introducedAt: "2026-04-01T00:00:00Z",
    reinforcementRuns: Array.from(
      { length: REINFORCEMENT_SATURATION + 3 },
      (_, i) => `run-${i}`,
    ),
    lastReinforcedAt: "2026-05-01T00:00:00Z",
  });
  const { breakdown, utility } = composeUtility({
    record,
    now: new Date("2026-05-01T00:00:00Z"),
  });
  assert.equal(breakdown.reinforcement, 1);
  assert.equal(breakdown.recency, 1);
  // Reinforcement+recency = 0.35 + 0.10 = 0.45.
  assert.equal(utility.toFixed(4), "0.4500");
});

test("composeUtility: recency decays linearly to 0 at decay-days threshold", () => {
  const lastTime = new Date("2026-04-01T00:00:00Z").toISOString();
  const record = makeRecord({
    sectionId: "abc",
    introducedRunId: "run-A",
    introducedAt: "2026-03-01T00:00:00Z",
    lastReinforcedAt: lastTime,
  });
  // At halfway through 60-day decay, recency = 0.5.
  const { breakdown: half } = composeUtility({
    record,
    now: new Date("2026-05-01T00:00:00Z"), // 30 days later
    recencyDecayDays: 60,
  });
  assert.equal(half.recency, 0.5);
  // At full decay, recency = 0.
  const { breakdown: zero } = composeUtility({
    record,
    now: new Date("2026-05-31T00:00:00Z"), // 60 days later
    recencyDecayDays: 60,
  });
  assert.equal(zero.recency, 0);
  // Past decay window — still 0, doesn't go negative.
  const { breakdown: past } = composeUtility({
    record,
    now: new Date("2026-08-01T00:00:00Z"),
    recencyDecayDays: 60,
  });
  assert.equal(past.recency, 0);
});

test("composeUtility: rejects weights that don't sum to 1", () => {
  const record = makeRecord({
    sectionId: "abc",
    introducedRunId: "run-A",
    introducedAt: "2026-04-01T00:00:00Z",
  });
  assert.throws(() =>
    composeUtility({
      record,
      weights: {
        reinforcement: 0.5,
        pushback: 0.5,
        pastIncident: 0.5,
        recency: 0,
        crossReference: 0,
      },
    }),
  );
});

// ---------------------------------------------------------------------------
// proposeAssessment — verdict boundary table.
// ---------------------------------------------------------------------------

test("proposeAssessment: keep verdict for heavily-reinforced section", async () => {
  const blocks: BlockSpec[] = [
    {
      runId: "run-keep",
      issueId: 100,
      heading: "Heavily-reinforced rule",
      body: "Body of a useful rule that has been cited many times.",
      ts: "2026-04-01T00:00:00Z",
    },
  ];
  const md = makeAgentClaudeMd(blocks);
  const stableId = deriveStableSectionId("run-keep", [100]);
  const file = makeFile("agent-test", [
    makeRecord({
      sectionId: stableId,
      introducedRunId: "run-keep",
      introducedAt: "2026-04-01T00:00:00Z",
      reinforcementRuns: ["r1", "r2", "r3", "r4", "r5", "r6"],
      pushbackRuns: ["p1", "p2", "p3"],
      pastIncidentDates: ["2026-04-01", "2026-04-15", "2026-04-30"],
      lastReinforcedAt: "2026-05-01T00:00:00Z",
    }),
  ]);
  await withTempClaudeMd(md, async (filePath) => {
    const proposal = await proposeAssessment({
      agentId: "agent-test",
      claudeMdPathOverride: filePath,
      utilityFileOverride: file,
      now: new Date("2026-05-01T00:00:00Z"),
    });
    assert.equal(proposal.sections.length, 1);
    assert.equal(proposal.sections[0].verdict, "keep");
    assert.equal(proposal.summary.keep, 1);
    assert.equal(proposal.summary.drop, 0);
    assert.equal(proposal.summary.trim, 0);
    assert.ok(proposal.sections[0].utility > 0.5);
  });
});

test("proposeAssessment: drop verdict for never-reinforced section", async () => {
  const blocks: BlockSpec[] = [
    {
      runId: "run-drop",
      issueId: 200,
      heading: "Never-cited one-off observation",
      body: "Body that was added but never cited again across many runs.",
      ts: "2026-01-01T00:00:00Z",
    },
  ];
  const md = makeAgentClaudeMd(blocks);
  const stableId = deriveStableSectionId("run-drop", [200]);
  const file = makeFile("agent-test", [
    makeRecord({
      sectionId: stableId,
      introducedRunId: "run-drop",
      introducedAt: "2026-01-01T00:00:00Z",
    }),
  ]);
  await withTempClaudeMd(md, async (filePath) => {
    const proposal = await proposeAssessment({
      agentId: "agent-test",
      claudeMdPathOverride: filePath,
      utilityFileOverride: file,
      now: new Date("2026-05-01T00:00:00Z"),
    });
    assert.equal(proposal.sections[0].verdict, "drop");
    assert.match(proposal.sections[0].note ?? "", /never reinforced|no recurring incident/);
  });
});

test("proposeAssessment: missing-record falls back to keep with explanatory note", async () => {
  const blocks: BlockSpec[] = [
    {
      runId: "run-fresh",
      issueId: 300,
      heading: "Fresh section",
      body: "Just appended, no SectionUtilityRecord yet.",
      ts: "2026-05-06T00:00:00Z",
    },
  ];
  const md = makeAgentClaudeMd(blocks);
  // Empty utility file — no record for this section.
  const file = makeFile("agent-test", []);
  await withTempClaudeMd(md, async (filePath) => {
    const proposal = await proposeAssessment({
      agentId: "agent-test",
      claudeMdPathOverride: filePath,
      utilityFileOverride: file,
      now: new Date("2026-05-06T00:00:00Z"),
    });
    assert.equal(proposal.sections.length, 1);
    const s = proposal.sections[0];
    assert.equal(s.verdict, "keep");
    assert.equal(s.missingUtilityRecord, true);
    assert.equal(proposal.summary.missingRecord, 1);
    assert.match(s.note ?? "", /no utility record/);
  });
});

test("proposeAssessment: trim verdict yields a sub-recommendation citing the oldest dated example", async () => {
  // Force a `trim` outcome by giving the section weak-but-nonzero signals
  // and using a tighter keepThreshold so the benefit lands in the middle band.
  const body = [
    "Past incident 2026-03-15: foo broke.",
    "Past incident 2026-04-20: foo broke again.",
  ].join("\n\n");
  const blocks: BlockSpec[] = [
    {
      runId: "run-trim",
      issueId: 400,
      heading: "Section with two dated incidents",
      body,
      ts: "2026-03-01T00:00:00Z",
    },
  ];
  const md = makeAgentClaudeMd(blocks);
  const stableId = deriveStableSectionId("run-trim", [400]);
  const file = makeFile("agent-test", [
    makeRecord({
      sectionId: stableId,
      introducedRunId: "run-trim",
      introducedAt: "2026-03-01T00:00:00Z",
      reinforcementRuns: ["r1"],
      pastIncidentDates: ["2026-03-15", "2026-04-20"],
      lastReinforcedAt: "2026-04-25T00:00:00Z",
    }),
  ]);
  await withTempClaudeMd(md, async (filePath) => {
    const proposal = await proposeAssessment({
      agentId: "agent-test",
      claudeMdPathOverride: filePath,
      utilityFileOverride: file,
      now: new Date("2026-05-01T00:00:00Z"),
      // Bias the bands so this section lands in the trim middle.
      keepThreshold: 5.0,
      dropThreshold: 0.0001,
    });
    const s = proposal.sections[0];
    assert.equal(s.verdict, "trim");
    assert.match(s.note ?? "", /2026-03-15/);
    assert.match(s.note ?? "", /drop the .* dated example/);
  });
});

// ---------------------------------------------------------------------------
// Threshold validation + summary aggregation.
// ---------------------------------------------------------------------------

test("proposeAssessment: rejects dropThreshold > keepThreshold", async () => {
  const md = makeAgentClaudeMd([]);
  await withTempClaudeMd(md, async (filePath) => {
    await assert.rejects(
      proposeAssessment({
        agentId: "agent-test",
        claudeMdPathOverride: filePath,
        utilityFileOverride: makeFile("agent-test", []),
        keepThreshold: 0.1,
        dropThreshold: 0.5,
      }),
      /dropThreshold .* must be ≤ keepThreshold/,
    );
  });
});

test("proposeAssessment: empty CLAUDE.md returns clean empty proposal", async () => {
  await withTempClaudeMd("", async (filePath) => {
    const proposal = await proposeAssessment({
      agentId: "agent-test",
      claudeMdPathOverride: filePath,
      utilityFileOverride: makeFile("agent-test", []),
    });
    assert.equal(proposal.sectionCount, 0);
    assert.equal(proposal.sections.length, 0);
    assert.equal(proposal.summary.keep, 0);
    assert.match(proposal.recommendation, /Nothing to assess/);
  });
});

test("proposeAssessment: missing CLAUDE.md is treated as empty", async () => {
  const proposal = await proposeAssessment({
    agentId: "agent-test",
    claudeMdPathOverride: "/nonexistent/path/CLAUDE.md",
    utilityFileOverride: makeFile("agent-test", []),
  });
  assert.equal(proposal.sectionCount, 0);
  assert.equal(proposal.totalBytes, 0);
});

test("proposeAssessment: surfaces total bytes, section count, and CCF", async () => {
  const blocks: BlockSpec[] = [
    {
      runId: "run-A",
      issueId: 1,
      heading: "First",
      body: "x".repeat(500),
      ts: "2026-04-01T00:00:00Z",
    },
    {
      runId: "run-B",
      issueId: 2,
      heading: "Second",
      body: "y".repeat(500),
      ts: "2026-04-02T00:00:00Z",
    },
  ];
  const md = makeAgentClaudeMd(blocks);
  await withTempClaudeMd(md, async (filePath) => {
    const proposal = await proposeAssessment({
      agentId: "agent-test",
      claudeMdPathOverride: filePath,
      utilityFileOverride: makeFile("agent-test", []),
    });
    assert.equal(proposal.sectionCount, 2);
    assert.ok(proposal.totalBytes > 1000);
    // CCF must be ≥ 1 (clamped) for any input size.
    assert.ok(proposal.contextCostFactor >= 1);
  });
});

// ---------------------------------------------------------------------------
// Formatter — sanity on rendered output.
// ---------------------------------------------------------------------------

test("formatAssessProposal: renders header, per-section verdict, recommendation", async () => {
  const blocks: BlockSpec[] = [
    {
      runId: "run-keep",
      issueId: 100,
      heading: "Heavily-reinforced rule",
      body: "Body content.",
      ts: "2026-04-01T00:00:00Z",
    },
  ];
  const md = makeAgentClaudeMd(blocks);
  const stableId = deriveStableSectionId("run-keep", [100]);
  const file = makeFile("agent-test", [
    makeRecord({
      sectionId: stableId,
      introducedRunId: "run-keep",
      introducedAt: "2026-04-01T00:00:00Z",
      reinforcementRuns: ["r1", "r2", "r3", "r4", "r5"],
      pushbackRuns: ["p1"],
      pastIncidentDates: ["2026-04-15"],
      lastReinforcedAt: "2026-04-30T00:00:00Z",
    }),
  ]);
  await withTempClaudeMd(md, async (filePath) => {
    const proposal = await proposeAssessment({
      agentId: "agent-test",
      claudeMdPathOverride: filePath,
      utilityFileOverride: file,
      now: new Date("2026-05-01T00:00:00Z"),
    });
    const text = formatAssessProposal(proposal);
    assert.match(text, /Health assessment for agent-test/);
    assert.match(text, /Total bytes:/);
    assert.match(text, /Composite utility:/);
    assert.match(text, /Context-cost factor:/);
    assert.match(text, /Per-section verdict:/);
    assert.match(text, /\[s0\]/);
    assert.match(text, /Recommendation:/);
  });
});

test("DEFAULT thresholds are sane (drop ≤ keep)", () => {
  assert.ok(DEFAULT_DROP_THRESHOLD <= DEFAULT_KEEP_THRESHOLD);
  // Defaults sum-to-1 invariant for utility weights.
  const w = DEFAULT_UTILITY_WEIGHTS;
  const sum =
    w.reinforcement + w.pushback + w.pastIncident + w.recency + w.crossReference;
  assert.ok(Math.abs(sum - 1) < 1e-6);
});
