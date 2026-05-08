// Pre-dispatch per-issue cost estimator (issue #99).
//
// Heuristic v1: count distinct backtick-quoted file paths in the matching
// `feature-plans/issue-<N>-*.md` and multiply by a calibrated per-file
// constant. Issues with no plan file (or a plan with zero extractable file
// paths) fall back to a calibrated rolling-history median when prior runs
// exist (issue #249), or to a static constant on first install. This is a
// deliberately small, pure function — per-agent-history-weighted is a
// separate, larger refactor.
//
// Why a constant per-file factor at all: the largest cost driver of a
// successful run is the number of read→edit→re-read cycles the coding agent
// burns turn budget on, which scales linearly with the number of files
// touched. The constant was calibrated against the actual run costs of the
// first few merged dispatches (#85, #91, #92, #93) and the budget-blown
// re-runs of #34. Re-tune if forecast vs actual diverges by >50% on >20% of
// past issues.
//
// Why a rolling-history fallback for plan-less issues: the static $1.50
// constant systematically under-counted real implementation runs by 3-4×
// (smoke-test mean $5.12/issue, run-2026-05-08T10-06-35-869Z $5.35/issue
// against a $1.50 forecast). Calibrating the fallback against the operator's
// own recent history makes the gate's TOTAL accurate enough to drive
// `--max-cost-usd` decisions instead of misleading them.
//
// No I/O in `estimateIssueCost`. `readPlanFileForIssue` and
// `computeHistoryFallback` do the only fs access; tests can drive
// `estimateIssueCost` and `partitionByBudget` purely against in-memory inputs.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { IssueSummary } from "../types.js";

export const COST_PER_FILE_USD = 0.4;
export const FALLBACK_ESTIMATE_USD = 1.5;

// Issue #249: rolling-history fallback parameters. N=20 runs gives enough
// signal to avoid a single outlier dominating, while staying recent enough
// that a tooling/model-tier change rolls into the median within ~one work
// session of dispatches. Recency-weight 2× on the most-recent 5 runs biases
// the median toward the operator's current dispatch shape (post-fix, post-
// CLAUDE.md-rewrite, post-tier-change) without entirely discarding the
// older signal.
export const ROLLING_HISTORY_RUNS = 20;
export const ROLLING_HISTORY_RECENT_BIAS_COUNT = 5;
export const ROLLING_HISTORY_RECENT_BIAS_WEIGHT = 2;
const RUN_STATE_FILE_RE = /^run-\d{4}-\d{2}-\d{2}T.*\.json$/;

export type EstimateSource = "plan" | "fallback" | "history-fallback";

export interface IssueCostEstimate {
  estimateUsd: number;
  source: EstimateSource;
  // Set only when source === "plan" and the plan contained at least one
  // recognizable file path.
  fileCount?: number;
  // Plan file basename (e.g. `issue-99-cost-forecast.md`). Set only when
  // source === "plan".
  planFile?: string;
  // Set only when source === "history-fallback" — the number of historical
  // runs that contributed to the rolling-history median. Surfaced in the
  // gate text so the operator sees the calibration provenance.
  historySampleCount?: number;
}

/**
 * Calibration data computed once per `vp-dev run` invocation by reading the
 * last N completed run-state files. The CLI passes this through to every
 * `estimateIssueCost` call so plan-less issues get a calibrated fallback
 * instead of the static $1.50 constant.
 */
export interface HistoryFallback {
  /** Recency-weighted median per-issue USD across the last N runs. */
  medianUsd: number;
  /** Number of historical run-state files that contributed (≤ N). */
  sampleCount: number;
}

export interface EstimateInput {
  // Raw plan markdown contents. Undefined when no plan file exists for the
  // issue — the estimator returns the rolling-history median (when
  // available) or the static fallback constant.
  planContent?: string;
  // Plan filename (basename only) — surfaced in the preview text so the user
  // can find the source.
  planFile?: string;
  /**
   * Optional rolling-history calibration (issue #249). When present AND the
   * plan path returns no file count, the estimator returns the historical
   * median with `source: "history-fallback"` instead of the static constant.
   * Computed once by the caller (`computeHistoryFallback`) and threaded
   * through to every per-issue call so the median is consistent across the
   * forecast block.
   */
  historyFallback?: HistoryFallback;
}

/**
 * Pure: given plan content (or undefined), return a USD estimate.
 *
 * Behaviour:
 *   - planContent undefined        → history-fallback (if present) else constant
 *   - planContent present, 0 files → history-fallback (if present) else constant
 *                                   (plan was probably prose-only or used
 *                                   non-backtick file notation; degrade
 *                                   rather than estimate $0)
 *   - planContent present, N files → N × COST_PER_FILE_USD
 */
export function estimateIssueCost(input: EstimateInput): IssueCostEstimate {
  if (typeof input.planContent !== "string" || input.planContent.length === 0) {
    return fallbackEstimate(input.historyFallback);
  }
  const fileCount = countDistinctFilePaths(input.planContent);
  if (fileCount === 0) {
    return fallbackEstimate(input.historyFallback);
  }
  return {
    estimateUsd: fileCount * COST_PER_FILE_USD,
    source: "plan",
    fileCount,
    planFile: input.planFile,
  };
}

function fallbackEstimate(history?: HistoryFallback): IssueCostEstimate {
  if (history && history.sampleCount > 0) {
    return {
      estimateUsd: history.medianUsd,
      source: "history-fallback",
      historySampleCount: history.sampleCount,
    };
  }
  return { estimateUsd: FALLBACK_ESTIMATE_USD, source: "fallback" };
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
 * Recency-weighted median (issue #249).
 *
 * Sorts (value, weight) pairs by value, then walks the cumulative weight
 * curve to find the sample where the cumulative crosses half the total
 * weight. When the cumulative lands exactly on the half-total boundary
 * AND a next sample exists, returns the mean of the boundary value and
 * the next — matches numpy's even-length boundary convention.
 *
 * Pure / no I/O — easy to unit-test with hand-crafted inputs.
 */
export function weightedMedian(values: number[], weights: number[]): number {
  if (values.length === 0) {
    throw new Error("weightedMedian: empty input");
  }
  if (values.length !== weights.length) {
    throw new Error("weightedMedian: values and weights length mismatch");
  }
  const pairs = values.map((v, i) => ({ value: v, weight: weights[i] }));
  pairs.sort((a, b) => a.value - b.value);
  const totalWeight = pairs.reduce((s, p) => s + p.weight, 0);
  const half = totalWeight / 2;
  let cumulative = 0;
  for (let i = 0; i < pairs.length; i++) {
    cumulative += pairs[i].weight;
    if (cumulative >= half) {
      if (cumulative === half && i + 1 < pairs.length) {
        return (pairs[i].value + pairs[i + 1].value) / 2;
      }
      return pairs[i].value;
    }
  }
  return pairs[pairs.length - 1].value; // unreachable
}

/**
 * Read the last N `run-<ISO>.json` files from `stateDir`, compute a
 * per-run per-issue cost (`costAccumulatedUsd / numCompletedIssues`) for
 * each eligible run, and return a recency-weighted median (issue #249).
 *
 * Returns null when fewer than `minSamples` eligible runs exist on disk —
 * e.g. on first install before any completed runs, or when every recent
 * run was a dry-run / aborted-budget. The caller (`estimateIssueCost`)
 * then falls back to the static $1.50 constant with `source: "fallback"`.
 *
 * Eligibility for a single run-state file:
 *   - Parses as JSON.
 *   - `dryRun !== true` — dry-runs don't consume agent budget at all.
 *   - `costAccumulatedUsd` is a finite positive number — a $0 run is either
 *     a no-op or a triage-only short-circuit and doesn't calibrate
 *     dispatch cost.
 *   - At least one issue ended in `done` or `failed` — `aborted-budget`
 *     and `pending` are excluded because they didn't complete a full
 *     dispatch cycle.
 *
 * The eligible-issue count (denominator) intentionally excludes
 * `aborted-budget` and `pending` to keep "per-issue dispatch cost" honest
 * — including them would dilute the average toward zero and make the
 * fallback miscalibrated upward.
 *
 * Performance: O(N) fs.readFile calls (N=20), each <50KB. Runs once per
 * `vp-dev run` invocation at gate-build time; cost is dominated by the
 * surrounding triage / dedup model calls.
 */
export async function computeHistoryFallback(opts: {
  stateDir: string;
  /** Defaults to `ROLLING_HISTORY_RUNS`. */
  limit?: number;
  /** Minimum eligible samples required to return non-null. Defaults to 1. */
  minSamples?: number;
}): Promise<HistoryFallback | null> {
  const limit = opts.limit ?? ROLLING_HISTORY_RUNS;
  const minSamples = opts.minSamples ?? 1;
  let entries: string[];
  try {
    entries = await fs.readdir(opts.stateDir);
  } catch {
    // Missing state dir → first install, no calibration data yet.
    return null;
  }
  // Lex-sort = chronological by ISO-timestamp filename (matches
  // `pickLatestRunIdFromEntries` in src/state/runState.ts). Reverse to
  // walk most-recent-first so the recency weighting indexes 0..limit
  // line up with "most recent" → "oldest".
  const recentFiles = entries
    .filter((e) => RUN_STATE_FILE_RE.test(e))
    .sort()
    .reverse()
    .slice(0, limit);
  const samples: number[] = [];
  for (const filename of recentFiles) {
    const sample = await readRunSample(path.join(opts.stateDir, filename));
    if (sample !== null) samples.push(sample);
  }
  if (samples.length < minSamples) return null;
  // Weight: most-recent ROLLING_HISTORY_RECENT_BIAS_COUNT samples get
  // ROLLING_HISTORY_RECENT_BIAS_WEIGHT, the rest get 1. Index in `samples`
  // corresponds to recency order (0 = most-recent) because
  // `recentFiles` was reversed before slicing.
  const weights = samples.map((_, i) =>
    i < ROLLING_HISTORY_RECENT_BIAS_COUNT ? ROLLING_HISTORY_RECENT_BIAS_WEIGHT : 1,
  );
  return {
    medianUsd: weightedMedian(samples, weights),
    sampleCount: samples.length,
  };
}

interface RunSampleShape {
  dryRun?: boolean;
  costAccumulatedUsd?: number;
  issues?: Record<string, { status?: string }>;
}

/**
 * Read one run-state file and return its per-issue cost, or null if the
 * run is ineligible (dry-run, zero-spend, no completed issues, malformed).
 * Pure-ish — fs.readFile is the only side effect, errors swallowed.
 */
async function readRunSample(filePath: string): Promise<number | null> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
  let state: RunSampleShape;
  try {
    state = JSON.parse(raw) as RunSampleShape;
  } catch {
    return null;
  }
  if (state.dryRun === true) return null;
  const cost = state.costAccumulatedUsd;
  if (typeof cost !== "number" || !Number.isFinite(cost) || cost <= 0) return null;
  const issuesObj = state.issues ?? {};
  let completedCount = 0;
  for (const e of Object.values(issuesObj)) {
    if (e?.status === "done" || e?.status === "failed") completedCount += 1;
  }
  if (completedCount === 0) return null;
  return cost / completedCount;
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
