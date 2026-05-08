import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  COST_PER_FILE_USD,
  FALLBACK_ESTIMATE_USD,
  computeHistoryFallback,
  countDistinctFilePaths,
  estimateIssueCost,
  partitionByBudget,
  weightedMedian,
  type HistoryFallback,
  type IssueCostEstimate,
} from "./costEstimator.js";
import type { IssueSummary } from "../types.js";

function issue(id: number, title = `Issue ${id}`): IssueSummary {
  return { id, title, labels: [], state: "open", body: "" };
}

// Float-tolerant equality for budget arithmetic (3.6 - 1.2 - 2.4 lands on
// 1.4000000000000004, etc). 1e-9 is safely below the per-cent rounding the
// gate text rounds to with `.toFixed(2)`.
function assertApproxEqual(actual: number, expected: number, tol = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) < tol,
    `expected ~${expected}, got ${actual}`,
  );
}

test("estimateIssueCost: fallback when planContent is undefined", () => {
  const e = estimateIssueCost({});
  assert.equal(e.source, "fallback");
  assert.equal(e.estimateUsd, FALLBACK_ESTIMATE_USD);
  assert.equal(e.fileCount, undefined);
  assert.equal(e.planFile, undefined);
});

test("estimateIssueCost: fallback when planContent is empty string", () => {
  const e = estimateIssueCost({ planContent: "" });
  assert.equal(e.source, "fallback");
  assert.equal(e.estimateUsd, FALLBACK_ESTIMATE_USD);
});

test("estimateIssueCost: fallback when plan has no recognizable file paths", () => {
  const plan = `# Plan\n\nThis is prose with no backtick paths. Just words.`;
  const e = estimateIssueCost({ planContent: plan, planFile: "issue-1-x.md" });
  assert.equal(e.source, "fallback");
  assert.equal(e.estimateUsd, FALLBACK_ESTIMATE_USD);
  // planFile is intentionally NOT set on fallback — the user shouldn't be
  // pointed at a plan that didn't contribute to the estimate.
  assert.equal(e.planFile, undefined);
});

test("estimateIssueCost: counts distinct backtick-quoted file paths", () => {
  const plan = `## Files (~3)
- \`src/orchestrator/costEstimator.ts\` (new)
- \`src/orchestrator/setup.ts\` (extend)
- \`src/cli.ts\` (wire)
`;
  const e = estimateIssueCost({ planContent: plan, planFile: "issue-99.md" });
  assert.equal(e.source, "plan");
  assert.equal(e.fileCount, 3);
  assert.equal(e.estimateUsd, 3 * COST_PER_FILE_USD);
  assert.equal(e.planFile, "issue-99.md");
});

test("estimateIssueCost: dedupes when same path appears multiple times", () => {
  const plan = `Mention \`src/cli.ts\` once.

Then again here: \`src/cli.ts\`.

And a different file: \`src/types.ts\`.`;
  const e = estimateIssueCost({ planContent: plan });
  assert.equal(e.source, "plan");
  assert.equal(e.fileCount, 2);
  assert.equal(e.estimateUsd, 2 * COST_PER_FILE_USD);
});

test("countDistinctFilePaths: matches the recognized extension whitelist", () => {
  const plan = `
\`a.ts\` \`b.tsx\` \`c.js\` \`d.jsx\`
\`e.md\` \`f.json\` \`g.yml\` \`h.yaml\`
\`i.sh\` \`j.toml\` \`k.css\` \`l.html\`
`;
  assert.equal(countDistinctFilePaths(plan), 12);
});

test("countDistinctFilePaths: ignores non-source extensions", () => {
  // Random `.foo` / `.png` / `.exe` references shouldn't inflate the count.
  const plan = `
\`a.png\` \`b.exe\` \`screenshot.jpg\` \`notes.txt\` \`real.ts\`
`;
  assert.equal(countDistinctFilePaths(plan), 1);
});

test("countDistinctFilePaths: ignores backtick paths split by whitespace", () => {
  // Defensive: the negation class rejects whitespace inside the match, so a
  // weird "`hello world.ts`" doesn't get scored as a file.
  const plan = "Quote `hello world.ts` looks like a path but isn't a real one.";
  assert.equal(countDistinctFilePaths(plan), 0);
});

test("partitionByBudget: no budget set → all issues dispatched", () => {
  const issues = [issue(1), issue(2), issue(3)];
  const estimates = new Map<number, IssueCostEstimate>([
    [1, { estimateUsd: 1.2, source: "plan", fileCount: 3 }],
    [2, { estimateUsd: 1.5, source: "fallback" }],
    [3, { estimateUsd: 5.0, source: "plan", fileCount: 12 }],
  ]);
  const r = partitionByBudget({
    issues,
    estimates,
    budgetUsd: undefined,
    alreadySpentUsd: 0,
  });
  assert.equal(r.dispatch.length, 3);
  assert.equal(r.budgetExceededSkipped.length, 0);
  assert.equal(r.totalForecastUsd, 1.2 + 1.5 + 5.0);
});

test("partitionByBudget: budget partitions dispatch vs skipped", () => {
  const issues = [issue(84), issue(85), issue(34), issue(99)];
  const estimates = new Map<number, IssueCostEstimate>([
    [84, { estimateUsd: 1.2, source: "plan", fileCount: 3 }],
    [85, { estimateUsd: 2.4, source: "plan", fileCount: 6 }],
    [34, { estimateUsd: 3.6, source: "plan", fileCount: 9 }],
    [99, { estimateUsd: 5.0, source: "plan", fileCount: 12 }],
  ]);
  const r = partitionByBudget({
    issues,
    estimates,
    budgetUsd: 5.0,
    alreadySpentUsd: 0,
  });
  // 1.2 + 2.4 = 3.6 fits; 3.6 fits exactly (consumes remaining 1.4)? No —
  // 3.6 needs 3.6 but only 1.4 remains → skipped.
  // After 84+85, remaining is 5.0 - 3.6 = 1.4. 34's 3.6 > 1.4 → skip. 99's
  // 5.0 > 1.4 → skip.
  assert.deepEqual(r.dispatch.map((i) => i.id), [84, 85]);
  assert.equal(r.budgetExceededSkipped.length, 2);
  assert.equal(r.budgetExceededSkipped[0].issue.id, 34);
  assert.equal(r.budgetExceededSkipped[1].issue.id, 99);
  // remainingBudgetUsd is captured at the moment of evaluation. Both
  // skipped entries see the same remaining (~1.4) since neither was
  // dispatched, so neither consumed budget. Compared with a tolerance —
  // 5.0 - 1.2 - 2.4 lands on 1.4000000000000004 due to float arithmetic.
  assertApproxEqual(r.budgetExceededSkipped[0].remainingBudgetUsd, 5.0 - 3.6);
  assertApproxEqual(r.budgetExceededSkipped[1].remainingBudgetUsd, 5.0 - 3.6);
  assertApproxEqual(r.totalForecastUsd, 3.6);
});

test("partitionByBudget: skipping a big issue lets a smaller later issue still fit", () => {
  // Greedy first-fit: issue 1 (big) is skipped, but issue 2 (small) still
  // dispatches because issue 1 didn't consume budget.
  const issues = [issue(1), issue(2)];
  const estimates = new Map<number, IssueCostEstimate>([
    [1, { estimateUsd: 5.0, source: "plan", fileCount: 12 }],
    [2, { estimateUsd: 0.8, source: "plan", fileCount: 2 }],
  ]);
  const r = partitionByBudget({
    issues,
    estimates,
    budgetUsd: 2.0,
    alreadySpentUsd: 0,
  });
  assert.deepEqual(r.dispatch.map((i) => i.id), [2]);
  assert.equal(r.budgetExceededSkipped.length, 1);
  assert.equal(r.budgetExceededSkipped[0].issue.id, 1);
});

test("partitionByBudget: alreadySpentUsd reduces remaining budget", () => {
  const issues = [issue(1)];
  const estimates = new Map<number, IssueCostEstimate>([
    [1, { estimateUsd: 1.5, source: "fallback" }],
  ]);
  // Budget $2 minus $0.80 already spent on triage → $1.20 remaining.
  // 1.50 > 1.20 → skip.
  const r = partitionByBudget({
    issues,
    estimates,
    budgetUsd: 2.0,
    alreadySpentUsd: 0.8,
  });
  assert.equal(r.dispatch.length, 0);
  assert.equal(r.budgetExceededSkipped.length, 1);
  assert.equal(r.budgetExceededSkipped[0].remainingBudgetUsd, 1.2);
});

test("partitionByBudget: missing estimate falls back to constant rather than crashing", () => {
  const issues = [issue(1)];
  const estimates = new Map<number, IssueCostEstimate>(); // intentionally empty
  const r = partitionByBudget({
    issues,
    estimates,
    budgetUsd: 5.0,
    alreadySpentUsd: 0,
  });
  assert.equal(r.dispatch.length, 1);
  assert.equal(r.totalForecastUsd, FALLBACK_ESTIMATE_USD);
});

test("partitionByBudget: equal-to-remaining estimate dispatches (boundary)", () => {
  const issues = [issue(1)];
  const estimates = new Map<number, IssueCostEstimate>([
    [1, { estimateUsd: 2.0, source: "plan", fileCount: 5 }],
  ]);
  const r = partitionByBudget({
    issues,
    estimates,
    budgetUsd: 2.0,
    alreadySpentUsd: 0,
  });
  // 2.0 > 2.0 is false → dispatches. Strict greater-than matches the
  // existing exceedsBudget semantics in costTracker.ts.
  assert.equal(r.dispatch.length, 1);
  assert.equal(r.budgetExceededSkipped.length, 0);
});

// =====================================================================
// Issue #249: rolling-history fallback
// =====================================================================

test("estimateIssueCost: history-fallback when no plan AND historyFallback provided", () => {
  const history: HistoryFallback = { medianUsd: 5.12, sampleCount: 11 };
  const e = estimateIssueCost({ historyFallback: history });
  assert.equal(e.source, "history-fallback");
  assert.equal(e.estimateUsd, 5.12);
  assert.equal(e.historySampleCount, 11);
  assert.equal(e.fileCount, undefined);
  assert.equal(e.planFile, undefined);
});

test("estimateIssueCost: history-fallback when plan has zero file paths", () => {
  // Mirrors the "fallback when plan has no recognizable file paths" case but
  // with calibration data — the prose-only plan should NOT prevent the
  // calibrated fallback from kicking in.
  const plan = `# Plan\n\nThis is prose with no backtick paths. Just words.`;
  const history: HistoryFallback = { medianUsd: 4.2, sampleCount: 8 };
  const e = estimateIssueCost({
    planContent: plan,
    planFile: "issue-1-x.md",
    historyFallback: history,
  });
  assert.equal(e.source, "history-fallback");
  assert.equal(e.estimateUsd, 4.2);
  assert.equal(e.historySampleCount, 8);
  // planFile is intentionally NOT propagated on the fallback path — same
  // contract as the static-fallback case in the original test.
  assert.equal(e.planFile, undefined);
});

test("estimateIssueCost: plan source unaffected by historyFallback presence", () => {
  // When the plan yields a file count, the per-file calculation wins —
  // historyFallback is only consulted on the fallback path.
  const plan = `\`a.ts\` \`b.ts\``;
  const history: HistoryFallback = { medianUsd: 99.99, sampleCount: 20 };
  const e = estimateIssueCost({ planContent: plan, historyFallback: history });
  assert.equal(e.source, "plan");
  assert.equal(e.fileCount, 2);
  assert.equal(e.estimateUsd, 2 * COST_PER_FILE_USD);
  assert.equal(e.historySampleCount, undefined);
});

test("estimateIssueCost: empty-sample-count history degrades to constant", () => {
  // Defensive: a HistoryFallback with sampleCount === 0 should not be
  // honored — the caller may surface the static-fallback variant instead.
  const history: HistoryFallback = { medianUsd: 5.0, sampleCount: 0 };
  const e = estimateIssueCost({ historyFallback: history });
  assert.equal(e.source, "fallback");
  assert.equal(e.estimateUsd, FALLBACK_ESTIMATE_USD);
});

test("weightedMedian: uniform weights match plain median (odd-length)", () => {
  // Three samples → middle value wins.
  const m = weightedMedian([1, 5, 3], [1, 1, 1]);
  assert.equal(m, 3);
});

test("weightedMedian: uniform weights match plain median (even-length boundary)", () => {
  // Four uniform samples → cumulative half-total lands exactly on the 2nd
  // sample, so we average sorted[1] and sorted[2].
  // sorted = [1, 2, 3, 4], totalWeight=4, half=2.
  // i=0: cumulative=1 (<2, continue). i=1: cumulative=2 (==half, average
  // sorted[1]=2 with sorted[2]=3 → 2.5).
  const m = weightedMedian([1, 2, 3, 4], [1, 1, 1, 1]);
  assert.equal(m, 2.5);
});

test("weightedMedian: recency-weighted shifts median toward heavier samples", () => {
  // Old samples [1, 1, 1] all weight 1; new samples [10, 10] weight 2 each.
  // Sorted by value: 1(w=1), 1(w=1), 1(w=1), 10(w=2), 10(w=2). totalWeight=7,
  // half=3.5. Cumulative: 1, 2, 3, 5(>=3.5). Boundary not exact → return 10.
  const m = weightedMedian([1, 1, 1, 10, 10], [1, 1, 1, 2, 2]);
  assert.equal(m, 10);
});

test("weightedMedian: empty input throws", () => {
  assert.throws(() => weightedMedian([], []), /empty input/);
});

test("weightedMedian: length mismatch throws", () => {
  assert.throws(() => weightedMedian([1, 2], [1]), /length mismatch/);
});

// Helper: write a synthetic run-state file with a controlled cost / issue
// shape so `computeHistoryFallback` has eligible samples to score.
async function writeRunStateFile(
  dir: string,
  filename: string,
  spec: {
    costAccumulatedUsd?: number;
    issueStatuses?: string[];
    dryRun?: boolean;
  },
): Promise<void> {
  const issues: Record<string, { status?: string }> = {};
  (spec.issueStatuses ?? []).forEach((s, i) => {
    issues[String(100 + i)] = { status: s };
  });
  const state: Record<string, unknown> = {
    runId: filename.replace(/\.json$/, ""),
    issues,
    dryRun: spec.dryRun ?? false,
  };
  if (spec.costAccumulatedUsd !== undefined) {
    state.costAccumulatedUsd = spec.costAccumulatedUsd;
  }
  await fs.writeFile(path.join(dir, filename), JSON.stringify(state));
}

async function makeStateDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "vp-dev-history-"));
  return dir;
}

test("computeHistoryFallback: missing state dir returns null", async () => {
  const r = await computeHistoryFallback({
    stateDir: path.join(tmpdir(), `vp-dev-no-such-dir-${Date.now()}`),
  });
  assert.equal(r, null);
});

test("computeHistoryFallback: empty state dir returns null", async () => {
  const dir = await makeStateDir();
  try {
    const r = await computeHistoryFallback({ stateDir: dir });
    assert.equal(r, null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("computeHistoryFallback: ignores non-run files (current-run.txt, run-confirm-*)", async () => {
  const dir = await makeStateDir();
  try {
    await fs.writeFile(path.join(dir, "current-run.txt"), "run-2026-01-01T00-00-00-000Z");
    await fs.writeFile(path.join(dir, "run-confirm-abc123.json"), "{}");
    const r = await computeHistoryFallback({ stateDir: dir });
    assert.equal(r, null, "neither file matches RUN_STATE_FILE_RE");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("computeHistoryFallback: skips dry-run, zero-cost, and no-completed-issues runs", async () => {
  const dir = await makeStateDir();
  try {
    // Eligible: $5/issue, 1 done.
    await writeRunStateFile(dir, "run-2026-05-01T00-00-00-000Z.json", {
      costAccumulatedUsd: 5,
      issueStatuses: ["done"],
    });
    // Ineligible: dry-run.
    await writeRunStateFile(dir, "run-2026-05-02T00-00-00-000Z.json", {
      costAccumulatedUsd: 5,
      issueStatuses: ["done"],
      dryRun: true,
    });
    // Ineligible: zero cost.
    await writeRunStateFile(dir, "run-2026-05-03T00-00-00-000Z.json", {
      costAccumulatedUsd: 0,
      issueStatuses: ["done"],
    });
    // Ineligible: only aborted-budget + pending — no completed issues.
    await writeRunStateFile(dir, "run-2026-05-04T00-00-00-000Z.json", {
      costAccumulatedUsd: 10,
      issueStatuses: ["aborted-budget", "pending"],
    });
    // Ineligible: missing costAccumulatedUsd entirely.
    await writeRunStateFile(dir, "run-2026-05-05T00-00-00-000Z.json", {
      issueStatuses: ["done"],
    });
    const r = await computeHistoryFallback({ stateDir: dir });
    assert.ok(r);
    assert.equal(r.sampleCount, 1, "only the eligible run contributed");
    assert.equal(r.medianUsd, 5);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("computeHistoryFallback: per-run cost is total / completed-issue count", async () => {
  const dir = await makeStateDir();
  try {
    // $24 / 6 done = $4/issue. The aborted-budget entry is excluded from
    // the denominator (consistent with "didn't complete a full dispatch").
    await writeRunStateFile(dir, "run-2026-05-01T00-00-00-000Z.json", {
      costAccumulatedUsd: 24,
      issueStatuses: ["done", "done", "done", "done", "failed", "failed", "aborted-budget"],
    });
    const r = await computeHistoryFallback({ stateDir: dir });
    assert.ok(r);
    assert.equal(r.sampleCount, 1);
    assert.equal(r.medianUsd, 4);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("computeHistoryFallback: respects limit and recency-weights the median", async () => {
  const dir = await makeStateDir();
  try {
    // Older runs (lex-earlier filenames) at $1/issue, recent runs at $10/issue.
    // The 5 most-recent get weight=2 (per ROLLING_HISTORY_RECENT_BIAS_*),
    // older 15 get weight=1. With 15 olds at $1 and 5 recents at $10:
    // values sorted: [1×15, 10×5], weights aligned: [1×15, 2×5].
    // totalWeight = 15 + 10 = 25, half = 12.5.
    // cumulative walk on sorted: at i=12 → 12, i=13 → 13 ≥ 12.5 → return 1.
    // So even with recency weighting, the recent samples' weight-doubling
    // alone doesn't tip the median — confirms the bias is moderate, not
    // overwhelming. This test pins the calibration choice so a future
    // change (e.g. weight=4) breaks it loudly.
    for (let i = 0; i < 15; i++) {
      const ts = `2026-05-01T00-00-${String(i).padStart(2, "0")}-000Z`;
      await writeRunStateFile(dir, `run-${ts}.json`, {
        costAccumulatedUsd: 1,
        issueStatuses: ["done"],
      });
    }
    for (let i = 0; i < 5; i++) {
      // Lexically later filenames → most-recent in sort order.
      const ts = `2026-05-02T00-00-${String(i).padStart(2, "0")}-000Z`;
      await writeRunStateFile(dir, `run-${ts}.json`, {
        costAccumulatedUsd: 10,
        issueStatuses: ["done"],
      });
    }
    const r = await computeHistoryFallback({ stateDir: dir });
    assert.ok(r);
    assert.equal(r.sampleCount, 20);
    assert.equal(r.medianUsd, 1);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("computeHistoryFallback: limit truncates to most-recent N runs", async () => {
  const dir = await makeStateDir();
  try {
    // 25 eligible runs; limit=20 should drop the 5 oldest.
    for (let i = 0; i < 25; i++) {
      const ts = `2026-05-01T${String(i).padStart(2, "0")}-00-00-000Z`;
      await writeRunStateFile(dir, `run-${ts}.json`, {
        costAccumulatedUsd: 5,
        issueStatuses: ["done"],
      });
    }
    const r = await computeHistoryFallback({ stateDir: dir, limit: 20 });
    assert.ok(r);
    assert.equal(r.sampleCount, 20);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("computeHistoryFallback: minSamples gate returns null below threshold", async () => {
  const dir = await makeStateDir();
  try {
    await writeRunStateFile(dir, "run-2026-05-01T00-00-00-000Z.json", {
      costAccumulatedUsd: 5,
      issueStatuses: ["done"],
    });
    const r = await computeHistoryFallback({ stateDir: dir, minSamples: 3 });
    assert.equal(r, null, "1 eligible sample < minSamples=3");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("computeHistoryFallback: malformed JSON files are skipped, not fatal", async () => {
  const dir = await makeStateDir();
  try {
    await fs.writeFile(
      path.join(dir, "run-2026-05-01T00-00-00-000Z.json"),
      "not valid json {{{",
    );
    await writeRunStateFile(dir, "run-2026-05-02T00-00-00-000Z.json", {
      costAccumulatedUsd: 7,
      issueStatuses: ["done"],
    });
    const r = await computeHistoryFallback({ stateDir: dir });
    assert.ok(r);
    assert.equal(r.sampleCount, 1, "only the well-formed run contributed");
    assert.equal(r.medianUsd, 7);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
