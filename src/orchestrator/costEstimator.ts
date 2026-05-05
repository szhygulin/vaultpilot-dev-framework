// Pre-dispatch per-issue cost estimator (issue #99).
//
// Heuristic v1: count distinct backtick-quoted file paths in the matching
// `feature-plans/issue-<N>-*.md` and multiply by a calibrated per-file
// constant. Issues with no plan file (or a plan with zero extractable file
// paths) fall back to a constant. This is a deliberately small, pure
// function — v2 (per-agent-history-weighted) is a separate issue.
//
// Why a constant per-file factor at all: the largest cost driver of a
// successful run is the number of read→edit→re-read cycles the coding agent
// burns turn budget on, which scales linearly with the number of files
// touched. The constant was calibrated against the actual run costs of the
// first few merged dispatches (#85, #91, #92, #93) and the budget-blown
// re-runs of #34. Re-tune if forecast vs actual diverges by >50% on >20% of
// past issues.
//
// No I/O in the pure estimator. `readPlanFileForIssue` does the only fs
// access; tests can drive `estimateIssueCost` and `partitionByBudget` purely
// against in-memory inputs.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { IssueSummary } from "../types.js";

export const COST_PER_FILE_USD = 0.4;
export const FALLBACK_ESTIMATE_USD = 1.5;

export interface IssueCostEstimate {
  estimateUsd: number;
  source: "plan" | "fallback";
  // Set only when source === "plan" and the plan contained at least one
  // recognizable file path.
  fileCount?: number;
  // Plan file basename (e.g. `issue-99-cost-forecast.md`). Set only when
  // source === "plan".
  planFile?: string;
}

export interface EstimateInput {
  // Raw plan markdown contents. Undefined when no plan file exists for the
  // issue — the estimator returns the fallback constant.
  planContent?: string;
  // Plan filename (basename only) — surfaced in the preview text so the user
  // can find the source.
  planFile?: string;
}

/**
 * Pure: given plan content (or undefined), return a USD estimate.
 *
 * Behaviour:
 *   - planContent undefined        → fallback constant
 *   - planContent present, 0 files → fallback constant (plan was probably
 *                                   prose-only or used a non-backtick file
 *                                   notation; degrade rather than estimate $0)
 *   - planContent present, N files → N × COST_PER_FILE_USD
 */
export function estimateIssueCost(input: EstimateInput): IssueCostEstimate {
  if (typeof input.planContent !== "string" || input.planContent.length === 0) {
    return { estimateUsd: FALLBACK_ESTIMATE_USD, source: "fallback" };
  }
  const fileCount = countDistinctFilePaths(input.planContent);
  if (fileCount === 0) {
    return { estimateUsd: FALLBACK_ESTIMATE_USD, source: "fallback" };
  }
  return {
    estimateUsd: fileCount * COST_PER_FILE_USD,
    source: "plan",
    fileCount,
    planFile: input.planFile,
  };
}

// Match a backtick-quoted token that ends in a recognized source-file
// extension. The negation classes inside the backticks reject whitespace and
// nested backticks so a stray prose-paragraph backtick can't expand the
// match across a paragraph break. `[^`\s]+` ensures a contiguous token; the
// extension whitelist keeps this tight enough not to score "`some/word.json`"
// in a generic discussion as a real file unless it actually looks like one
// the agent will read.
const FILE_PATH_RE = /`([^`\s]+\.(ts|tsx|js|jsx|md|json|yml|yaml|sh|toml|css|html))`/g;

export function countDistinctFilePaths(planContent: string): number {
  const set = new Set<string>();
  for (const m of planContent.matchAll(FILE_PATH_RE)) {
    set.add(m[1]);
  }
  return set.size;
}

/**
 * Locate `feature-plans/issue-<N>-*.md` under a target-repo path. Returns
 * null if the directory doesn't exist or no plan file matches the issue —
 * the estimator then degrades to the fallback constant.
 *
 * Targets the *target repo* (where plans are committed), not the agent's
 * worktree — pre-dispatch the worktree may not exist yet.
 */
export async function readPlanFileForIssue(opts: {
  targetRepoPath: string;
  issueId: number;
}): Promise<{ filename: string; content: string } | null> {
  const dir = path.join(opts.targetRepoPath, "feature-plans");
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return null;
  }
  const prefix = `issue-${opts.issueId}-`;
  const matches = entries
    .filter((e) => e.startsWith(prefix) && e.endsWith(".md"))
    .sort();
  if (matches.length === 0) return null;
  const filename = matches[0];
  try {
    const content = await fs.readFile(path.join(dir, filename), "utf8");
    return { filename, content };
  } catch {
    return null;
  }
}

export interface BudgetExceededSkipped {
  issue: IssueSummary;
  estimateUsd: number;
  // Budget remaining at the moment THIS issue was evaluated. Surfaces in the
  // gate text as "exceeds $X.XX remaining at issue-time" so the user can see
  // why an issue with a $1.20 estimate got skipped — earlier issues already
  // ate the budget.
  remainingBudgetUsd: number;
}

export interface PartitionInput {
  // Issues are evaluated in this order. The first-fit greedy walks the list
  // once: an issue whose estimate fits the remaining budget is dispatched
  // and consumes budget; an issue whose estimate exceeds remaining budget is
  // skipped and does NOT consume budget (so a later, smaller issue may still
  // fit).
  issues: IssueSummary[];
  estimates: Map<number, IssueCostEstimate>;
  // Hard ceiling. When undefined, no partitioning fires and every issue is
  // dispatched (matches "no --max-cost-usd set" semantics).
  budgetUsd?: number;
  // Already-incurred run cost (today: pre-dispatch triage). Subtracted from
  // budgetUsd before the walk so the partition reflects what's actually
  // available when the first issue dispatches.
  alreadySpentUsd: number;
}

export interface PartitionResult {
  dispatch: IssueSummary[];
  budgetExceededSkipped: BudgetExceededSkipped[];
  totalForecastUsd: number;
}

export function partitionByBudget(input: PartitionInput): PartitionResult {
  const dispatch: IssueSummary[] = [];
  const skipped: BudgetExceededSkipped[] = [];
  let cumulativeForecast = 0;

  for (const issue of input.issues) {
    const est = input.estimates.get(issue.id);
    // Defensive: an issue without an estimate should never happen (cli.ts
    // populates the map for every dispatch candidate). Treat it as fallback
    // rather than crash the gate.
    const estimateUsd = est?.estimateUsd ?? FALLBACK_ESTIMATE_USD;

    if (input.budgetUsd === undefined) {
      dispatch.push(issue);
      cumulativeForecast += estimateUsd;
      continue;
    }
    const remaining = input.budgetUsd - input.alreadySpentUsd - cumulativeForecast;
    if (estimateUsd > remaining) {
      skipped.push({ issue, estimateUsd, remainingBudgetUsd: remaining });
    } else {
      dispatch.push(issue);
      cumulativeForecast += estimateUsd;
    }
  }

  return {
    dispatch,
    budgetExceededSkipped: skipped,
    totalForecastUsd: cumulativeForecast,
  };
}
