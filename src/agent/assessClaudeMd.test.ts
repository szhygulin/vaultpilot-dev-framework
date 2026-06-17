import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  composeUtility,
  formatAssessProposal,
  proposeAssessment,
  applyAssessment,
  DEFAULT_KEEP_THRESHOLD,
  DEFAULT_DROP_THRESHOLD,
  DEFAULT_UTILITY_WEIGHTS,
  REINFORCEMENT_SATURATION,
  FRESH_SECTION_DROP_DAYS,
} from "./assessClaudeMd.js";
import {
  deriveStableSectionId,
  type AgentUtilityFile,
  type SectionUtilityRecord,
  LESSON_UTILITY_SCHEMA_VERSION,
} from "../state/lessonUtility.js";
import { formatSentinelHeader } from "../util/sentinels.js";
import {
  computeAssessHash,
  readAssessConfirmToken,
} from "../state/assessConfirm.js";

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

// ---------------------------------------------------------------------------
// assessConfirm — token store unit tests (no file I/O against real STATE_DIR).
// ---------------------------------------------------------------------------

test("computeAssessHash: same proposal + file yields same hash", async () => {
  const blocks: BlockSpec[] = [
    {
      runId: "run-hash",
      issueId: 1,
      heading: "Rule A",
      body: "body A",
      ts: "2026-04-01T00:00:00Z",
    },
  ];
  const md = makeAgentClaudeMd(blocks);
  const stableId = deriveStableSectionId("run-hash", [1]);
  const file = makeFile("agent-test", [
    makeRecord({
      sectionId: stableId,
      introducedRunId: "run-hash",
      introducedAt: "2026-04-01T00:00:00Z",
    }),
  ]);
  await withTempClaudeMd(md, async (filePath) => {
    const proposal = await proposeAssessment({
      agentId: "agent-test",
      claudeMdPathOverride: filePath,
      utilityFileOverride: file,
      now: new Date("2026-05-01T00:00:00Z"),
    });
    const hash1 = computeAssessHash(proposal, md);
    const hash2 = computeAssessHash(proposal, md);
    assert.equal(hash1, hash2);
    // Different file → different hash.
    const hash3 = computeAssessHash(proposal, md + " changed");
    assert.notEqual(hash1, hash3);
  });
});

test("readAssessConfirmToken: missing token returns ok:false missing", async () => {
  const result = await readAssessConfirmToken("deadbeef12345678");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "missing");
  }
});

test("readAssessConfirmToken: invalid hex token throws synchronously", async () => {
  // tokenFilePath validates the hex format before any I/O; a non-hex token
  // triggers an Error that propagates as a rejection from readAssessConfirmToken.
  await assert.rejects(
    readAssessConfirmToken("not-hex-!@#$"),
    /Invalid token format/,
  );
});

// ---------------------------------------------------------------------------
// applyAssessment — apply-path tests.
// ---------------------------------------------------------------------------

async function withTempClaudeMdAndDir<T>(
  initialContent: string,
  fn: (filePath: string, dir: string) => Promise<T>,
): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "assess-apply-test-"));
  const filePath = path.join(dir, "CLAUDE.md");
  await fs.writeFile(filePath, initialContent);
  try {
    return await fn(filePath, dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("applyAssessment: rejects when assessHash mismatches (file drifted)", async () => {
  const now = new Date("2026-05-01T00:00:00Z");
  const blocks: BlockSpec[] = [
    {
      runId: "run-drift",
      issueId: 10,
      heading: "Drop me",
      body: "low-utility body",
      ts: "2026-01-01T00:00:00Z",
    },
  ];
  const md = makeAgentClaudeMd(blocks);
  const stableId = deriveStableSectionId("run-drift", [10]);
  const file = makeFile("agent-test", [
    makeRecord({
      sectionId: stableId,
      introducedRunId: "run-drift",
      introducedAt: "2026-01-01T00:00:00Z",
    }),
  ]);
  await withTempClaudeMdAndDir(md, async (filePath) => {
    const proposal = await proposeAssessment({
      agentId: "agent-test",
      claudeMdPathOverride: filePath,
      utilityFileOverride: file,
      now,
    });
    const staleHash = "0000000000000000000000000000000000000000000000000000000000000000";
    const result = await applyAssessment({
      agentId: "agent-test",
      proposal,
      expectedAssessHash: staleHash,
      claudeMdPathOverride: filePath,
      utilityFileOverride: file,
      now,
    });
    assert.equal(result.kind, "drift-rejected");
    if (result.kind === "drift-rejected") {
      assert.equal(result.reason, "assess-hash");
    }
  });
});

test("applyAssessment: rejects drop of section introduced within 14 days (fresh guard)", async () => {
  const now = new Date("2026-05-01T00:00:00Z");
  // Introduce the section 3 days ago — within the 14-day fresh window.
  const introducedAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const blocks: BlockSpec[] = [
    {
      runId: "run-fresh",
      issueId: 20,
      heading: "Too fresh to drop",
      body: "low-utility body that is brand new",
      ts: introducedAt,
    },
  ];
  const md = makeAgentClaudeMd(blocks);
  const stableId = deriveStableSectionId("run-fresh", [20]);
  const file = makeFile("agent-test", [
    makeRecord({
      sectionId: stableId,
      introducedRunId: "run-fresh",
      introducedAt,
    }),
  ]);
  await withTempClaudeMdAndDir(md, async (filePath) => {
    // Build a proposal where the section gets a drop verdict by forcing thresholds.
    const proposal = await proposeAssessment({
      agentId: "agent-test",
      claudeMdPathOverride: filePath,
      utilityFileOverride: file,
      now,
      keepThreshold: 999,
      dropThreshold: 0.0001,
    });
    // The proposal may say "keep" for a fresh missing-record section;
    // override via a patched proposal to force drop verdict for testing the guard.
    const patchedProposal = {
      ...proposal,
      sections: proposal.sections.map((s) => ({ ...s, verdict: "drop" as const })),
      summary: { ...proposal.summary, drop: proposal.sections.length, keep: 0, trim: 0 },
    };
    const assessHash = computeAssessHash(patchedProposal, md);
    const result = await applyAssessment({
      agentId: "agent-test",
      proposal: patchedProposal,
      expectedAssessHash: assessHash,
      claudeMdPathOverride: filePath,
      utilityFileOverride: file,
      now,
    });
    assert.equal(result.kind, "drift-rejected");
    if (result.kind === "drift-rejected") {
      assert.equal(result.reason, "fresh-section");
      assert.match(result.details, /too new/);
    }
  });
});

test("applyAssessment: allows drop of fresh section with allowDropFresh override", async () => {
  const now = new Date("2026-05-01T00:00:00Z");
  const introducedAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const blocks: BlockSpec[] = [
    {
      runId: "run-fresh-override",
      issueId: 21,
      heading: "Fresh but operator overrides",
      body: "low-utility body",
      ts: introducedAt,
    },
  ];
  const md = makeAgentClaudeMd(blocks);
  const stableId = deriveStableSectionId("run-fresh-override", [21]);
  const file = makeFile("agent-test", [
    makeRecord({
      sectionId: stableId,
      introducedRunId: "run-fresh-override",
      introducedAt,
    }),
  ]);
  await withTempClaudeMdAndDir(md, async (filePath) => {
    const proposal = await proposeAssessment({
      agentId: "agent-test",
      claudeMdPathOverride: filePath,
      utilityFileOverride: file,
      now,
      keepThreshold: 999,
      dropThreshold: 0.0001,
    });
    const patchedProposal = {
      ...proposal,
      sections: proposal.sections.map((s) => ({ ...s, verdict: "drop" as const })),
      summary: { ...proposal.summary, drop: proposal.sections.length, keep: 0, trim: 0 },
    };
    const assessHash = computeAssessHash(patchedProposal, md);
    const result = await applyAssessment({
      agentId: "agent-test",
      proposal: patchedProposal,
      expectedAssessHash: assessHash,
      claudeMdPathOverride: filePath,
      utilityFileOverride: file,
      now,
      allowDropFresh: true,
    });
    // Should proceed (applied or drift-rejected for other reasons — e.g. stable ID re-derivation)
    // The key assertion is it's NOT a "fresh-section" rejection.
    if (result.kind === "drift-rejected") {
      assert.notEqual(result.reason, "fresh-section");
    }
  });
});

test("applyAssessment: rejects drop of section with crossReferenceCount > 0", async () => {
  const now = new Date("2026-05-01T00:00:00Z");
  const blocks: BlockSpec[] = [
    {
      runId: "run-crossref",
      issueId: 30,
      heading: "Cross-referenced rule",
      body: "This is cited externally in PRs.",
      ts: "2026-01-01T00:00:00Z",
    },
  ];
  const md = makeAgentClaudeMd(blocks);
  const stableId = deriveStableSectionId("run-crossref", [30]);
  const file = makeFile("agent-test", [
    makeRecord({
      sectionId: stableId,
      introducedRunId: "run-crossref",
      introducedAt: "2026-01-01T00:00:00Z",
      crossReferenceCount: 2,
    }),
  ]);
  await withTempClaudeMdAndDir(md, async (filePath) => {
    // Build drop proposal via patching.
    const proposal = await proposeAssessment({
      agentId: "agent-test",
      claudeMdPathOverride: filePath,
      utilityFileOverride: file,
      now,
    });
    const patchedProposal = {
      ...proposal,
      sections: proposal.sections.map((s) => ({ ...s, verdict: "drop" as const })),
      summary: { ...proposal.summary, drop: proposal.sections.length, keep: 0, trim: 0 },
    };
    const assessHash = computeAssessHash(patchedProposal, md);
    const result = await applyAssessment({
      agentId: "agent-test",
      proposal: patchedProposal,
      expectedAssessHash: assessHash,
      claudeMdPathOverride: filePath,
      utilityFileOverride: file,
      now,
    });
    assert.equal(result.kind, "drift-rejected");
    if (result.kind === "drift-rejected") {
      assert.equal(result.reason, "cross-ref");
      assert.match(result.details, /crossReferenceCount/);
    }
  });
});

test("applyAssessment: correctly drops a section with drop verdict, leaves keep sections", async () => {
  const now = new Date("2026-05-01T00:00:00Z");
  const blocks: BlockSpec[] = [
    {
      runId: "run-keep",
      issueId: 40,
      heading: "Keeper section",
      body: "This is useful and should survive.",
      ts: "2026-01-01T00:00:00Z",
    },
    {
      runId: "run-dead",
      issueId: 41,
      heading: "Dead section",
      body: "Never cited, low utility.",
      ts: "2026-01-02T00:00:00Z",
    },
  ];
  const md = makeAgentClaudeMd(blocks);
  const keepId = deriveStableSectionId("run-keep", [40]);
  const deadId = deriveStableSectionId("run-dead", [41]);
  const file = makeFile("agent-test", [
    makeRecord({
      sectionId: keepId,
      introducedRunId: "run-keep",
      introducedAt: "2026-01-01T00:00:00Z",
      reinforcementRuns: ["r1", "r2", "r3", "r4", "r5"],
      lastReinforcedAt: "2026-04-30T00:00:00Z",
    }),
    makeRecord({
      sectionId: deadId,
      introducedRunId: "run-dead",
      introducedAt: "2026-01-02T00:00:00Z",
    }),
  ]);
  await withTempClaudeMdAndDir(md, async (filePath) => {
    // Get a natural proposal and patch the dead section to drop.
    const proposal = await proposeAssessment({
      agentId: "agent-test",
      claudeMdPathOverride: filePath,
      utilityFileOverride: file,
      now,
    });
    // Force: keep section[0] as keep, section[1] as drop.
    const patchedProposal = {
      ...proposal,
      sections: proposal.sections.map((s, i) => ({
        ...s,
        verdict: (i === 0 ? "keep" : "drop") as "keep" | "drop",
      })),
      summary: { ...proposal.summary, drop: 1, keep: 1, trim: 0 },
    };
    const assessHash = computeAssessHash(patchedProposal, md);
    const result = await applyAssessment({
      agentId: "agent-test",
      proposal: patchedProposal,
      expectedAssessHash: assessHash,
      claudeMdPathOverride: filePath,
      utilityFileOverride: file,
      now,
    });
    assert.equal(result.kind, "applied");
    if (result.kind === "applied") {
      assert.equal(result.sectionsDropped, 1);
      assert.ok(result.bytesAfter < result.bytesBefore);
    }
    const after = await fs.readFile(filePath, "utf-8");
    assert.match(after, /## Keeper section/);
    assert.doesNotMatch(after, /## Dead section/);
  });
});

test("applyAssessment: trim verdicts are surfaced but not acted on", async () => {
  const now = new Date("2026-05-01T00:00:00Z");
  const blocks: BlockSpec[] = [
    {
      runId: "run-trim",
      issueId: 50,
      heading: "Trim me",
      body: "Should be surfaced-not-acted.",
      ts: "2026-01-01T00:00:00Z",
    },
  ];
  const md = makeAgentClaudeMd(blocks);
  const stableId = deriveStableSectionId("run-trim", [50]);
  const file = makeFile("agent-test", [
    makeRecord({
      sectionId: stableId,
      introducedRunId: "run-trim",
      introducedAt: "2026-01-01T00:00:00Z",
      reinforcementRuns: ["r1"],
    }),
  ]);
  await withTempClaudeMdAndDir(md, async (filePath) => {
    const proposal = await proposeAssessment({
      agentId: "agent-test",
      claudeMdPathOverride: filePath,
      utilityFileOverride: file,
      now,
    });
    // Force all sections to trim verdict.
    const patchedProposal = {
      ...proposal,
      sections: proposal.sections.map((s) => ({ ...s, verdict: "trim" as const })),
      summary: { ...proposal.summary, trim: proposal.sections.length, keep: 0, drop: 0 },
    };
    const assessHash = computeAssessHash(patchedProposal, md);
    const result = await applyAssessment({
      agentId: "agent-test",
      proposal: patchedProposal,
      expectedAssessHash: assessHash,
      claudeMdPathOverride: filePath,
      utilityFileOverride: file,
      now,
    });
    // Should apply (no drops to gate on), sectionsDropped=0, trimSurfaced>0.
    assert.equal(result.kind, "applied");
    if (result.kind === "applied") {
      assert.equal(result.sectionsDropped, 0);
      assert.ok(result.trimSurfaced > 0);
    }
    // File must be UNCHANGED.
    const after = await fs.readFile(filePath, "utf-8");
    assert.equal(after, md);
  });
});

test("applyAssessment: empty drop set (all keep) returns applied with 0 drops", async () => {
  const now = new Date("2026-05-01T00:00:00Z");
  const blocks: BlockSpec[] = [
    {
      runId: "run-allkeep",
      issueId: 60,
      heading: "All keepers",
      body: "body",
      ts: "2026-01-01T00:00:00Z",
    },
  ];
  const md = makeAgentClaudeMd(blocks);
  const stableId = deriveStableSectionId("run-allkeep", [60]);
  const file = makeFile("agent-test", [
    makeRecord({
      sectionId: stableId,
      introducedRunId: "run-allkeep",
      introducedAt: "2026-01-01T00:00:00Z",
      reinforcementRuns: ["r1", "r2", "r3", "r4", "r5"],
      lastReinforcedAt: "2026-04-30T00:00:00Z",
    }),
  ]);
  await withTempClaudeMdAndDir(md, async (filePath) => {
    const proposal = await proposeAssessment({
      agentId: "agent-test",
      claudeMdPathOverride: filePath,
      utilityFileOverride: file,
      now,
    });
    const assessHash = computeAssessHash(proposal, md);
    const result = await applyAssessment({
      agentId: "agent-test",
      proposal,
      expectedAssessHash: assessHash,
      claudeMdPathOverride: filePath,
      utilityFileOverride: file,
      now,
    });
    assert.equal(result.kind, "applied");
    if (result.kind === "applied") {
      assert.equal(result.sectionsDropped, 0);
    }
  });
});

test("applyAssessment: missing file returns drift-rejected missing-file", async () => {
  const now = new Date("2026-05-01T00:00:00Z");
  const blocks: BlockSpec[] = [
    {
      runId: "run-missing",
      issueId: 70,
      heading: "Gone",
      body: "body",
      ts: "2026-01-01T00:00:00Z",
    },
  ];
  const md = makeAgentClaudeMd(blocks);
  const stableId = deriveStableSectionId("run-missing", [70]);
  const file = makeFile("agent-test", [
    makeRecord({
      sectionId: stableId,
      introducedRunId: "run-missing",
      introducedAt: "2026-01-01T00:00:00Z",
    }),
  ]);
  const proposal = await proposeAssessment({
    agentId: "agent-test",
    claudeMdPathOverride: "/nonexistent/CLAUDE.md",
    utilityFileOverride: file,
    now,
  });
  const assessHash = computeAssessHash(proposal, md);
  const result = await applyAssessment({
    agentId: "agent-test",
    proposal,
    expectedAssessHash: assessHash,
    claudeMdPathOverride: "/nonexistent/CLAUDE.md",
    utilityFileOverride: file,
    now,
  });
  assert.equal(result.kind, "drift-rejected");
  if (result.kind === "drift-rejected") {
    assert.equal(result.reason, "missing-file");
  }
});

test("FRESH_SECTION_DROP_DAYS constant is 14", () => {
  assert.equal(FRESH_SECTION_DROP_DAYS, 14);
});
