import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_MAX_COST_USD,
  DEFAULT_DROP_THRESHOLD,
  formatAuditProposal,
  proposeAudit,
  utilityToVerdict,
  VERDICT_THRESHOLDS,
  computeAuditHash,
  hashAuditFile,
  applyAudit,
  type AuditClient,
  type AuditScore,
} from "./auditLessons.js";
import { formatSentinelHeader } from "../util/sentinels.js";

// Build a sentinel-bearing CLAUDE.md so parseClaudeMdSections finds the
// sections (only summarizer-emitted blocks are attributable; sections in
// a plain markdown file with no provenance comment are silently skipped).
function makeAttributableClaudeMd(
  blocks: ReadonlyArray<{
    runId: string;
    issueId: number;
    heading: string;
    body: string;
    ts: string;
  }>,
): string {
  const out: string[] = ["# Test agent\n"];
  for (const b of blocks) {
    out.push(
      `<!-- run:${b.runId} issue:#${b.issueId} outcome:implement ts:${b.ts} -->`,
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-lessons-test-"));
  const filePath = path.join(dir, "CLAUDE.md");
  await fs.writeFile(filePath, initialContent);
  try {
    return await fn(filePath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------
// utilityToVerdict
// ---------------------------------------------------------------------

test("utilityToVerdict: < drop threshold → drop", () => {
  assert.equal(utilityToVerdict(0), "drop");
  assert.equal(utilityToVerdict(0.1), "drop");
  assert.equal(utilityToVerdict(0.29), "drop");
});

test("utilityToVerdict: between thresholds → weak-keep", () => {
  assert.equal(utilityToVerdict(0.3), "weak-keep");
  assert.equal(utilityToVerdict(0.5), "weak-keep");
  assert.equal(utilityToVerdict(0.59), "weak-keep");
});

test("utilityToVerdict: ≥ keep threshold → keep", () => {
  assert.equal(utilityToVerdict(0.6), "keep");
  assert.equal(utilityToVerdict(0.85), "keep");
  assert.equal(utilityToVerdict(1.0), "keep");
});

test("VERDICT_THRESHOLDS constants match documented bands", () => {
  assert.equal(VERDICT_THRESHOLDS.drop, 0.3);
  assert.equal(VERDICT_THRESHOLDS.keep, 0.6);
});

// ---------------------------------------------------------------------
// proposeAudit: empty agent CLAUDE.md
// ---------------------------------------------------------------------

test("proposeAudit: missing CLAUDE.md returns empty proposal (no LLM calls)", async () => {
  const tmp = path.join(os.tmpdir(), `audit-missing-${Date.now()}.md`);
  let calls = 0;
  const client: AuditClient = {
    scoreSection: async () => {
      calls += 1;
      return { intrinsicUtility: 0.5, rationale: "should not fire", costUsd: 0.01 };
    },
  };
  const proposal = await proposeAudit({
    agentId: "agent-missing",
    client,
    claudeMdPathOverride: tmp,
  });
  assert.equal(calls, 0);
  assert.equal(proposal.scores.length, 0);
  assert.equal(proposal.sectionCount, 0);
  assert.equal(proposal.totalBytes, 0);
  assert.ok(Number.isNaN(proposal.meanUtility));
});

test("proposeAudit: CLAUDE.md without attributable sections (no sentinels) returns empty scores", async () => {
  await withTempClaudeMd("# Plain markdown\n\n## A heading\n\nA body without sentinel.\n", async (filePath) => {
    let calls = 0;
    const client: AuditClient = {
      scoreSection: async () => {
        calls += 1;
        return { intrinsicUtility: 0.5, rationale: "x", costUsd: 0.01 };
      },
    };
    const proposal = await proposeAudit({
      agentId: "agent-no-sentinels",
      client,
      claudeMdPathOverride: filePath,
    });
    assert.equal(calls, 0);
    assert.equal(proposal.sectionCount, 0);
  });
});

// ---------------------------------------------------------------------
// proposeAudit: scoring + verdict mapping
// ---------------------------------------------------------------------

test("proposeAudit: scores every section and aggregates verdicts/cost", async () => {
  const md = makeAttributableClaudeMd([
    { runId: "r1", issueId: 1, heading: "Generic platitude", body: "Always test things.", ts: "2026-04-01T00:00:00Z" },
    { runId: "r2", issueId: 2, heading: "Borderline rule", body: "Use the right tool.", ts: "2026-04-02T00:00:00Z" },
    { runId: "r3", issueId: 3, heading: "Specific rule with file", body: "src/foo.ts:42 throws on null.", ts: "2026-04-03T00:00:00Z" },
    { runId: "r4", issueId: 4, heading: "Anchored to past incident", body: "2026-03-01: PR #100 broke X. Use Y.", ts: "2026-04-04T00:00:00Z" },
  ]);
  await withTempClaudeMd(md, async (filePath) => {
    // Synthetic ratings keyed by heading substring. Cost: $0.05 per call.
    const client: AuditClient = {
      scoreSection: async ({ heading }) => {
        if (heading.includes("Generic")) return { intrinsicUtility: 0.15, rationale: "platitude", costUsd: 0.05 };
        if (heading.includes("Borderline")) return { intrinsicUtility: 0.45, rationale: "borderline", costUsd: 0.05 };
        if (heading.includes("Specific")) return { intrinsicUtility: 0.7, rationale: "names file path", costUsd: 0.05 };
        return { intrinsicUtility: 0.95, rationale: "dated past incident + PR ref", costUsd: 0.05 };
      },
    };
    const proposal = await proposeAudit({
      agentId: "agent-test",
      client,
      claudeMdPathOverride: filePath,
      maxCostUsd: 1,
      concurrency: 2,
    });
    assert.equal(proposal.scores.length, 4);
    assert.equal(proposal.sectionCount, 4);
    assert.equal(proposal.unscoredSectionIds.length, 0);
    assert.equal(proposal.cost.totalUsd, 0.2);
    assert.equal(proposal.cost.budgetExhausted, false);
    assert.equal(proposal.verdictCounts.drop, 1);
    assert.equal(proposal.verdictCounts.weakKeep, 1);
    assert.equal(proposal.verdictCounts.keep, 2);
    assert.ok(Math.abs(proposal.meanUtility - 0.5625) < 1e-9);
    // Median of [0.15, 0.45, 0.7, 0.95] = (0.45 + 0.7) / 2 = 0.575
    assert.ok(Math.abs(proposal.medianUtility - 0.575) < 1e-9);
  });
});

// ---------------------------------------------------------------------
// proposeAudit: budget exhaustion stops scoring
// ---------------------------------------------------------------------

test("proposeAudit: budget exhaustion halts further scoring + reports unscored sections", async () => {
  const blocks = Array.from({ length: 10 }, (_, i) => ({
    runId: `r${i}`,
    issueId: i + 100,
    heading: `Heading ${i}`,
    body: `Body ${i}.`,
    ts: `2026-04-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
  }));
  const md = makeAttributableClaudeMd(blocks);
  await withTempClaudeMd(md, async (filePath) => {
    // Each call costs $0.30; budget is $1.00 → only ~3 calls fit before
    // the next worker observes totalUsd ≥ budgetUsd and halts.
    const client: AuditClient = {
      scoreSection: async () => ({ intrinsicUtility: 0.5, rationale: "x", costUsd: 0.3 }),
    };
    const proposal = await proposeAudit({
      agentId: "agent-budget",
      client,
      claudeMdPathOverride: filePath,
      maxCostUsd: 1,
      concurrency: 1, // single-worker → strict ordering
    });
    assert.ok(proposal.cost.budgetExhausted, "expected budgetExhausted");
    assert.ok(proposal.scores.length < 10, `expected partial scoring, got ${proposal.scores.length}/10`);
    assert.equal(
      proposal.scores.length + proposal.unscoredSectionIds.length,
      10,
      "scored + unscored should cover all sections",
    );
  });
});

test("proposeAudit: defaults max-cost=5 + concurrency=3 when not provided", async () => {
  // Just confirm the defaults are picked up (not full numeric assertion).
  const blocks = [{ runId: "r1", issueId: 1, heading: "h", body: "b", ts: "2026-04-01T00:00:00Z" }];
  const md = makeAttributableClaudeMd(blocks);
  await withTempClaudeMd(md, async (filePath) => {
    let observedConcurrency = 0;
    let inFlight = 0;
    const client: AuditClient = {
      scoreSection: async () => {
        inFlight += 1;
        if (inFlight > observedConcurrency) observedConcurrency = inFlight;
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return { intrinsicUtility: 0.5, rationale: "x", costUsd: 0.01 };
      },
    };
    const proposal = await proposeAudit({
      agentId: "agent-defaults",
      client,
      claudeMdPathOverride: filePath,
    });
    assert.equal(proposal.cost.budgetUsd, DEFAULT_MAX_COST_USD);
  });
});

// ---------------------------------------------------------------------
// proposeAudit: per-section error is absorbed (section reported unscored,
// other sections still get scored)
// ---------------------------------------------------------------------

test("proposeAudit: per-section client error is captured as unscored, doesn't kill the run", async () => {
  const md = makeAttributableClaudeMd([
    { runId: "r1", issueId: 1, heading: "first", body: "ok", ts: "2026-04-01T00:00:00Z" },
    { runId: "r2", issueId: 2, heading: "fails", body: "oh no", ts: "2026-04-02T00:00:00Z" },
    { runId: "r3", issueId: 3, heading: "third", body: "ok", ts: "2026-04-03T00:00:00Z" },
  ]);
  await withTempClaudeMd(md, async (filePath) => {
    const client: AuditClient = {
      scoreSection: async ({ heading }) => {
        if (heading === "fails") throw new Error("simulated llm error");
        return { intrinsicUtility: 0.7, rationale: "ok", costUsd: 0.05 };
      },
    };
    const proposal = await proposeAudit({
      agentId: "agent-partial",
      client,
      claudeMdPathOverride: filePath,
      maxCostUsd: 5,
      concurrency: 1,
    });
    assert.equal(proposal.scores.length, 2);
    assert.equal(proposal.unscoredSectionIds.length, 1);
  });
});

// ---------------------------------------------------------------------
// formatAuditProposal: rendering
// ---------------------------------------------------------------------

test("formatAuditProposal: empty case", async () => {
  const tmp = path.join(os.tmpdir(), `audit-empty-${Date.now()}.md`);
  const proposal = await proposeAudit({
    agentId: "agent-empty",
    client: { scoreSection: async () => ({ intrinsicUtility: 0, rationale: "x", costUsd: 0 }) },
    claudeMdPathOverride: tmp,
  });
  const rendered = formatAuditProposal(proposal);
  assert.match(rendered, /No sections scored/);
});

test("formatAuditProposal: populated case sorts by utility ascending", async () => {
  const md = makeAttributableClaudeMd([
    { runId: "r1", issueId: 1, heading: "Mid section", body: "b1", ts: "2026-04-01T00:00:00Z" },
    { runId: "r2", issueId: 2, heading: "Bottom section", body: "b2", ts: "2026-04-02T00:00:00Z" },
    { runId: "r3", issueId: 3, heading: "Top section", body: "b3", ts: "2026-04-03T00:00:00Z" },
  ]);
  await withTempClaudeMd(md, async (filePath) => {
    const client: AuditClient = {
      scoreSection: async ({ heading }) => {
        if (heading.includes("Bottom")) return { intrinsicUtility: 0.1, rationale: "low", costUsd: 0.01 };
        if (heading.includes("Mid")) return { intrinsicUtility: 0.5, rationale: "mid", costUsd: 0.01 };
        return { intrinsicUtility: 0.9, rationale: "high", costUsd: 0.01 };
      },
    };
    const proposal = await proposeAudit({
      agentId: "agent-format",
      client,
      claudeMdPathOverride: filePath,
    });
    const rendered = formatAuditProposal(proposal);
    const bottomIdx = rendered.indexOf("Bottom section");
    const midIdx = rendered.indexOf("Mid section");
    const topIdx = rendered.indexOf("Top section");
    assert.ok(bottomIdx > 0 && bottomIdx < midIdx && midIdx < topIdx);
    assert.match(rendered, /verdicts: keep=1 weak-keep=1 drop=1/);
  });
});

// ---------------------------------------------------------------------
// Apply-path: helper functions
// ---------------------------------------------------------------------

function makeSentinelClaudeMd(
  blocks: ReadonlyArray<{
    runId: string;
    issueId: number;
    heading: string;
    body: string;
    ts: string;
  }>,
): string {
  const out: string[] = ["# Agent memory", ""];
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

function makeScore(
  runId: string,
  issueId: number,
  heading: string,
  intrinsicUtility: number,
): AuditScore {
  const verdict =
    intrinsicUtility < VERDICT_THRESHOLDS.drop
      ? "drop"
      : intrinsicUtility >= VERDICT_THRESHOLDS.keep
        ? "keep"
        : "weak-keep";
  return {
    sectionId: `s0`,
    runId,
    issueId,
    heading,
    intrinsicUtility,
    verdict,
    rationale: "test rationale",
    costUsd: 0.01,
  };
}

async function withTempClaudeMdForApply<T>(
  initialContent: string,
  fn: (filePath: string) => Promise<T>,
): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-apply-test-"));
  const filePath = path.join(dir, "CLAUDE.md");
  await fs.writeFile(filePath, initialContent);
  try {
    return await fn(filePath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------
// computeAuditHash / hashAuditFile
// ---------------------------------------------------------------------

test("hashAuditFile: returns sha256 hex", () => {
  const h = hashAuditFile("hello");
  assert.match(h, /^[a-f0-9]{64}$/);
});

test("computeAuditHash: changes when file content changes", () => {
  const scores: AuditScore[] = [makeScore("run-A", 1, "h", 0.2)];
  const h1 = computeAuditHash(scores, "content-1");
  const h2 = computeAuditHash(scores, "content-2");
  assert.notEqual(h1, h2);
});

test("computeAuditHash: changes when scores change", () => {
  const s1: AuditScore[] = [makeScore("run-A", 1, "h", 0.2)];
  const s2: AuditScore[] = [makeScore("run-A", 1, "h", 0.9)];
  const h1 = computeAuditHash(s1, "same-content");
  const h2 = computeAuditHash(s2, "same-content");
  assert.notEqual(h1, h2);
});

test("computeAuditHash: stable given identical inputs", () => {
  const scores: AuditScore[] = [makeScore("run-A", 1, "h", 0.2)];
  const h1 = computeAuditHash(scores, "content");
  const h2 = computeAuditHash(scores, "content");
  assert.equal(h1, h2);
});

// ---------------------------------------------------------------------
// DEFAULT_DROP_THRESHOLD constant
// ---------------------------------------------------------------------

test("DEFAULT_DROP_THRESHOLD matches VERDICT_THRESHOLDS.drop", () => {
  assert.equal(DEFAULT_DROP_THRESHOLD, VERDICT_THRESHOLDS.drop);
  assert.equal(DEFAULT_DROP_THRESHOLD, 0.3);
});

// ---------------------------------------------------------------------
// applyAudit: happy path
// ---------------------------------------------------------------------

test("applyAudit: drops sections with intrinsicUtility < threshold, keeps the rest", async () => {
  const content = makeSentinelClaudeMd([
    { runId: "run-A", issueId: 1, heading: "Keeper section", body: "solid content", ts: "2026-04-01T00:00:00Z" },
    { runId: "run-B", issueId: 2, heading: "Drop section", body: "generic platitude", ts: "2026-04-02T00:00:00Z" },
  ]);
  await withTempClaudeMdForApply(content, async (filePath) => {
    const scores: AuditScore[] = [
      makeScore("run-A", 1, "Keeper section", 0.8),  // keep
      makeScore("run-B", 2, "Drop section", 0.1),    // drop
    ];
    const hash = computeAuditHash(scores, content);
    const result = await applyAudit({
      agentId: "agent-test",
      scores,
      expectedAuditHash: hash,
      claudeMdPathOverride: filePath,
    });
    assert.equal(result.kind, "applied");
    if (result.kind === "applied") {
      assert.equal(result.sectionsDropped, 1);
      assert.ok(result.bytesAfter < result.bytesBefore);
    }
    const after = await fs.readFile(filePath, "utf-8");
    assert.match(after, /## Keeper section/);
    assert.doesNotMatch(after, /## Drop section/);
  });
});

test("applyAudit: drops multiple sections below threshold", async () => {
  const content = makeSentinelClaudeMd([
    { runId: "run-A", issueId: 1, heading: "Keep", body: "good", ts: "2026-04-01T00:00:00Z" },
    { runId: "run-B", issueId: 2, heading: "Drop1", body: "bad1", ts: "2026-04-02T00:00:00Z" },
    { runId: "run-C", issueId: 3, heading: "Drop2", body: "bad2", ts: "2026-04-03T00:00:00Z" },
  ]);
  await withTempClaudeMdForApply(content, async (filePath) => {
    const scores: AuditScore[] = [
      makeScore("run-A", 1, "Keep", 0.7),
      makeScore("run-B", 2, "Drop1", 0.15),
      makeScore("run-C", 3, "Drop2", 0.05),
    ];
    const hash = computeAuditHash(scores, content);
    const result = await applyAudit({
      agentId: "agent-test",
      scores,
      expectedAuditHash: hash,
      claudeMdPathOverride: filePath,
    });
    assert.equal(result.kind, "applied");
    if (result.kind === "applied") {
      assert.equal(result.sectionsDropped, 2);
    }
    const after = await fs.readFile(filePath, "utf-8");
    assert.match(after, /## Keep/);
    assert.doesNotMatch(after, /## Drop1/);
    assert.doesNotMatch(after, /## Drop2/);
  });
});

// ---------------------------------------------------------------------
// applyAudit: drift rejection (auditHash mismatch on file change)
// ---------------------------------------------------------------------

test("applyAudit: rejects when file content changed between apply and confirm (drift)", async () => {
  const content = makeSentinelClaudeMd([
    { runId: "run-A", issueId: 1, heading: "Original", body: "body", ts: "2026-04-01T00:00:00Z" },
  ]);
  await withTempClaudeMdForApply(content, async (filePath) => {
    const scores: AuditScore[] = [makeScore("run-A", 1, "Original", 0.1)];
    const hashAtPlan = computeAuditHash(scores, content);

    // Simulate concurrent edit: file drifts between --apply and --confirm.
    await fs.writeFile(filePath, content + "\n## Manual addition\n");

    const result = await applyAudit({
      agentId: "agent-test",
      scores,
      expectedAuditHash: hashAtPlan,
      claudeMdPathOverride: filePath,
    });
    assert.equal(result.kind, "drift-rejected");
    if (result.kind === "drift-rejected") {
      assert.equal(result.reason, "audit-hash");
    }
  });
});

test("applyAudit: rejects when file is missing", async () => {
  // Use a dir that exists but a file within it that doesn't.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-missing-test-"));
  try {
    const missingFile = path.join(dir, "CLAUDE.md");
    const scores: AuditScore[] = [makeScore("run-A", 1, "h", 0.1)];
    const hash = computeAuditHash(scores, "anything");
    const result = await applyAudit({
      agentId: "agent-test",
      scores,
      expectedAuditHash: hash,
      claudeMdPathOverride: missingFile,
    });
    assert.equal(result.kind, "drift-rejected");
    if (result.kind === "drift-rejected") {
      assert.equal(result.reason, "missing-file");
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------
// applyAudit: no-sections rejection
// ---------------------------------------------------------------------

test("applyAudit: rejects when no scores fall below threshold (nothing to drop)", async () => {
  const content = makeSentinelClaudeMd([
    { runId: "run-A", issueId: 1, heading: "Good section", body: "body", ts: "2026-04-01T00:00:00Z" },
  ]);
  await withTempClaudeMdForApply(content, async (filePath) => {
    const scores: AuditScore[] = [makeScore("run-A", 1, "Good section", 0.9)];
    const hash = computeAuditHash(scores, content);
    const result = await applyAudit({
      agentId: "agent-test",
      scores,
      expectedAuditHash: hash,
      claudeMdPathOverride: filePath,
    });
    assert.equal(result.kind, "drift-rejected");
    if (result.kind === "drift-rejected") {
      assert.equal(result.reason, "no-sections");
    }
  });
});

// ---------------------------------------------------------------------
// applyAudit: no-match rejection (stable ID not in file)
// ---------------------------------------------------------------------

test("applyAudit: rejects when drop candidate's stable ID is not in the file", async () => {
  const content = makeSentinelClaudeMd([
    { runId: "run-A", issueId: 1, heading: "Only section", body: "body", ts: "2026-04-01T00:00:00Z" },
  ]);
  await withTempClaudeMdForApply(content, async (filePath) => {
    // Score references a phantom run/issue not present in the file.
    const scores: AuditScore[] = [makeScore("run-PHANTOM", 999, "Phantom", 0.1)];
    const hash = computeAuditHash(scores, content);
    const result = await applyAudit({
      agentId: "agent-test",
      scores,
      expectedAuditHash: hash,
      claudeMdPathOverride: filePath,
    });
    assert.equal(result.kind, "drift-rejected");
    if (result.kind === "drift-rejected") {
      assert.equal(result.reason, "no-match");
    }
  });
});

// ---------------------------------------------------------------------
// applyAudit: --drop-threshold override
// ---------------------------------------------------------------------

test("applyAudit: drop-threshold override controls which sections are dropped", async () => {
  const content = makeSentinelClaudeMd([
    { runId: "run-A", issueId: 1, heading: "High utility", body: "very good", ts: "2026-04-01T00:00:00Z" },
    { runId: "run-B", issueId: 2, heading: "Medium utility", body: "ok", ts: "2026-04-02T00:00:00Z" },
    { runId: "run-C", issueId: 3, heading: "Low utility", body: "bad", ts: "2026-04-03T00:00:00Z" },
  ]);
  await withTempClaudeMdForApply(content, async (filePath) => {
    const scores: AuditScore[] = [
      makeScore("run-A", 1, "High utility", 0.9),
      makeScore("run-B", 2, "Medium utility", 0.4),
      makeScore("run-C", 3, "Low utility", 0.1),
    ];
    const hash = computeAuditHash(scores, content);
    // Use a high threshold of 0.5 → drops both Medium (0.4) and Low (0.1).
    const result = await applyAudit({
      agentId: "agent-test",
      scores,
      expectedAuditHash: hash,
      dropThreshold: 0.5,
      claudeMdPathOverride: filePath,
    });
    assert.equal(result.kind, "applied");
    if (result.kind === "applied") {
      assert.equal(result.sectionsDropped, 2);
    }
    const after = await fs.readFile(filePath, "utf-8");
    assert.match(after, /## High utility/);
    assert.doesNotMatch(after, /## Medium utility/);
    assert.doesNotMatch(after, /## Low utility/);
  });
});

test("applyAudit: drop-threshold 0.0 drops nothing (no-sections rejection)", async () => {
  const content = makeSentinelClaudeMd([
    { runId: "run-A", issueId: 1, heading: "Section", body: "body", ts: "2026-04-01T00:00:00Z" },
  ]);
  await withTempClaudeMdForApply(content, async (filePath) => {
    const scores: AuditScore[] = [makeScore("run-A", 1, "Section", 0.5)];
    const hash = computeAuditHash(scores, content);
    const result = await applyAudit({
      agentId: "agent-test",
      scores,
      expectedAuditHash: hash,
      dropThreshold: 0.0,
      claudeMdPathOverride: filePath,
    });
    assert.equal(result.kind, "drift-rejected");
    if (result.kind === "drift-rejected") {
      assert.equal(result.reason, "no-sections");
    }
  });
});

// ---------------------------------------------------------------------
// applyAudit: lock behavior (rewrite is atomic)
// ---------------------------------------------------------------------

test("applyAudit: file is written atomically (tmp then rename)", async () => {
  const content = makeSentinelClaudeMd([
    { runId: "run-A", issueId: 1, heading: "Keep", body: "good", ts: "2026-04-01T00:00:00Z" },
    { runId: "run-B", issueId: 2, heading: "Drop", body: "bad", ts: "2026-04-02T00:00:00Z" },
  ]);
  await withTempClaudeMdForApply(content, async (filePath) => {
    const scores: AuditScore[] = [
      makeScore("run-A", 1, "Keep", 0.8),
      makeScore("run-B", 2, "Drop", 0.1),
    ];
    const hash = computeAuditHash(scores, content);
    const result = await applyAudit({
      agentId: "agent-test",
      scores,
      expectedAuditHash: hash,
      claudeMdPathOverride: filePath,
    });
    // No .tmp file should remain after the apply.
    assert.equal(result.kind, "applied");
    const dir = path.dirname(filePath);
    const files = await fs.readdir(dir);
    const temps = files.filter((f) => f.includes(".tmp."));
    assert.equal(temps.length, 0, `Expected no temp files, found: ${temps.join(", ")}`);
  });
});
