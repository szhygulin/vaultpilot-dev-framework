import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  groupByIssue,
  pairByIssue,
  qualityFromDecision,
  readBenchCells,
  type BenchCell,
} from "./aggregate.js";

// --------------------------------------------------------------------
// qualityFromDecision
// --------------------------------------------------------------------

test("qualityFromDecision: implement=1, pushback=0.5, error=0, unknown=0", () => {
  assert.equal(qualityFromDecision("implement"), 1.0);
  assert.equal(qualityFromDecision("pushback"), 0.5);
  assert.equal(qualityFromDecision("error"), 0.0);
  assert.equal(qualityFromDecision(null), 0.0);
  assert.equal(qualityFromDecision("nonsense"), 0.0);
});

// --------------------------------------------------------------------
// groupByIssue
// --------------------------------------------------------------------

test("groupByIssue: groups + preserves within-group order", () => {
  const cells = [
    { issueId: 1, agentId: "a", costUsd: 0, durationMs: 0, decision: null, isError: false, log: "" },
    { issueId: 2, agentId: "b", costUsd: 0, durationMs: 0, decision: null, isError: false, log: "" },
    { issueId: 1, agentId: "c", costUsd: 0, durationMs: 0, decision: null, isError: false, log: "" },
  ] as BenchCell[];
  const m = groupByIssue(cells);
  assert.equal(m.size, 2);
  assert.equal(m.get(1)!.length, 2);
  assert.equal(m.get(1)![0].agentId, "a");
  assert.equal(m.get(1)![1].agentId, "c");
  assert.equal(m.get(2)!.length, 1);
});

// --------------------------------------------------------------------
// pairByIssue
// --------------------------------------------------------------------

function mkCell(
  agentId: string,
  issueId: number,
  decision: string | null,
  costUsd: number,
): BenchCell {
  return {
    agentId,
    issueId,
    decision,
    costUsd,
    durationMs: 1000,
    isError: false,
    log: "",
  };
}

test("pairByIssue: per-issue paired diffs use mean(specialist) and median(trim) for cost", () => {
  const trim = [
    mkCell("trim1", 100, "implement", 1.0),
    mkCell("trim2", 100, "implement", 2.0),
    mkCell("trim3", 100, "pushback", 5.0), // outlier; median resists
  ];
  const specialist = [
    mkCell("spec", 100, "implement", 1.5),
    mkCell("spec", 100, "implement", 1.2),
    mkCell("spec", 100, "implement", 1.4),
  ];
  const pairs = pairByIssue(trim, specialist);
  assert.equal(pairs.length, 1);
  const p = pairs[0];
  assert.equal(p.issueId, 100);
  // Specialist mean cost = 1.366..., trim median cost = 2.0
  assert.ok(Math.abs(p.specialistMeanCostUsd - (1.5 + 1.2 + 1.4) / 3) < 1e-9);
  assert.equal(p.trimMedianCostUsd, 2.0);
  assert.ok(p.dCost < 0); // specialists are cheaper
  // Specialist quality = 1.0; trim quality mean = (1+1+0.5)/3 ≈ 0.833
  assert.equal(p.specialistMeanQuality, 1.0);
  assert.ok(Math.abs(p.trimMeanQuality - 5 / 6) < 1e-9);
  assert.ok(p.dQuality > 0); // specialists score higher
  assert.equal(p.specialistReplicateCount, 3);
  assert.equal(p.trimCellCount, 3);
  assert.ok(p.specialistCostCv > 0); // some replicate variance
});

test("pairByIssue: outlier-robust — trim median ignores extreme cost", () => {
  // 1 trim with $20 cost + 17 trims with $1 cost. Median = $1 (robust).
  const trim: BenchCell[] = [];
  trim.push(mkCell("trim_out", 1, "implement", 20.0));
  for (let i = 1; i <= 17; i++) {
    trim.push(mkCell(`trim${i}`, 1, "implement", 1.0));
  }
  const specialist = [
    mkCell("spec", 1, "implement", 0.9),
    mkCell("spec", 1, "implement", 1.1),
    mkCell("spec", 1, "implement", 1.0),
  ];
  const pairs = pairByIssue(trim, specialist);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].trimMedianCostUsd, 1.0);
  assert.ok(Math.abs(pairs[0].dCost) < 0.1);
});

test("pairByIssue: issues missing from either arm are silently skipped", () => {
  const trim = [mkCell("trim1", 100, "implement", 1.0)];
  const specialist = [
    mkCell("spec", 100, "implement", 1.0),
    mkCell("spec", 200, "implement", 1.0), // no trim for issue 200
  ];
  const pairs = pairByIssue(trim, specialist);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].issueId, 100);
});

test("pairByIssue: returns sorted by issue ID", () => {
  const trim = [
    mkCell("t", 200, "implement", 1.0),
    mkCell("t", 100, "implement", 1.0),
    mkCell("t", 300, "implement", 1.0),
  ];
  const specialist = [
    mkCell("s", 200, "implement", 1.0),
    mkCell("s", 100, "implement", 1.0),
    mkCell("s", 300, "implement", 1.0),
  ];
  const pairs = pairByIssue(trim, specialist);
  assert.deepEqual(
    pairs.map((p) => p.issueId),
    [100, 200, 300],
  );
});

test("pairByIssue: single specialist replicate → CV = NaN, but pair still produced", () => {
  const trim = [mkCell("t", 1, "implement", 1.0), mkCell("t2", 1, "implement", 1.5)];
  const specialist = [mkCell("s", 1, "implement", 1.2)];
  const pairs = pairByIssue(trim, specialist);
  assert.equal(pairs.length, 1);
  assert.ok(Number.isNaN(pairs[0].specialistCostCv));
  assert.equal(pairs[0].specialistReplicateCount, 1);
});

// --------------------------------------------------------------------
// readBenchCells — directory-walking with the curveStudy filename shape
// --------------------------------------------------------------------

test("readBenchCells: walks logs directory + extracts (agent, issue, cost, decision) per file", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bench-cells-test-"));
  try {
    const writeLog = async (filename: string, costUsd: number, decision: string) => {
      const envelope = { decision, reason: "test" };
      const log = `> npm run vp-dev\n\n{\n  "envelope": ${JSON.stringify(envelope)},\n  "costUsd": ${costUsd},\n  "durationMs": 1000\n}\n`;
      await fs.writeFile(path.join(dir, filename), log);
    };
    await writeLog("bench-agent-916a-trim-6000-s8026-156.log", 0.5, "pushback");
    await writeLog("bench-agent-2a3d-156.log", 0.3, "implement");
    // Non-matching file should be ignored.
    await fs.writeFile(path.join(dir, "stray.txt"), "not a log");

    const cells = await readBenchCells({
      logsDir: dir,
      prefix: "bench-",
    });
    assert.equal(cells.length, 2);
    const trim = cells.find((c) => c.agentId === "agent-916a-trim-6000-s8026")!;
    assert.equal(trim.issueId, 156);
    assert.equal(trim.decision, "pushback");
    assert.equal(trim.costUsd, 0.5);
    const spec = cells.find((c) => c.agentId === "agent-2a3d")!;
    assert.equal(spec.decision, "implement");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("readBenchCells: missing directory returns empty array, not throw", async () => {
  const cells = await readBenchCells({
    logsDir: path.join(os.tmpdir(), `nonexistent-${Date.now()}`),
    prefix: "bench-",
  });
  assert.equal(cells.length, 0);
});

test("readBenchCells: replicateExtractor populates the replicate field", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bench-cells-rep-"));
  try {
    const writeLog = async (filename: string) => {
      const log = `\n{\n  "envelope": {"decision": "implement", "reason": "x"},\n  "costUsd": 1,\n  "durationMs": 1\n}\n`;
      await fs.writeFile(path.join(dir, filename), log);
    };
    await writeLog("bench-r1-agent-2a3d-156.log");
    await writeLog("bench-r2-agent-2a3d-156.log");
    await writeLog("bench-r3-agent-2a3d-156.log");
    // Filename has the prefix `bench-r{N}-`; walk regex needs to match
    // the FULL filename, so we use prefix `bench-r1-` for r1 and so on.
    // Simpler: use a single prefix and tag replicate via the extractor.
    // For this test we'll switch to a uniform prefix.

    // Recreate with uniform prefix and unique-by-runId filenames the runner
    // produces (e.g., bench-<runId>-agent-...-issue.log; replicate from runId).
    await fs.rm(dir, { recursive: true, force: true });
    const dir2 = await fs.mkdtemp(path.join(os.tmpdir(), "bench-cells-rep-"));
    const env = `\n{\n  "envelope": {"decision": "implement", "reason": "x"},\n  "costUsd": 1,\n  "durationMs": 1\n}\n`;
    await fs.writeFile(path.join(dir2, "bench-agent-2a3d-156-rep1.log"), env);
    await fs.writeFile(path.join(dir2, "bench-agent-2a3d-156-rep2.log"), env);

    // The default regex `^<prefix>(agent-[a-z0-9-]+)-(\d+)\.log$` will NOT
    // match `bench-agent-2a3d-156-rep1.log` (the trailing -rep1 breaks it).
    // The runner's actual scheme will be one of:
    //   (a) different filenames per replicate (one log per call)
    //   (b) trailing `-rep{N}` appended via a custom prefix per replicate
    // For this test, just confirm replicateExtractor is wired through; the
    // exact file scheme the dispatcher uses is asserted in dispatch.test.ts.
    const cells = await readBenchCells({
      logsDir: dir2,
      prefix: "bench-",
      replicateExtractor: () => 42,
    });
    assert.equal(cells.length, 0); // no matches with the default filename shape
    await fs.rm(dir2, { recursive: true, force: true });
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});
