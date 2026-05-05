import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COST_PER_FILE_USD,
  FALLBACK_ESTIMATE_USD,
  countDistinctFilePaths,
  estimateIssueCost,
  partitionByBudget,
  type IssueCostEstimate,
} from "./costEstimator.js";
import type { IssueSummary } from "../types.js";

function issue(id: number, title = `Issue ${id}`): IssueSummary {
  return { id, title, labels: [], state: "open" };
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
