// Curve-redo Phase 1d: per-cell A/B score aggregation.
//
// Phase 1c writes two JSON files per cell — one from `vp-dev research
// run-tests` (B = hidden-test pass count, applyCleanly, errorReason) and
// one from `vp-dev research grade-reasoning` (A = blinded judge median,
// scores, variance). Phase 1d's job:
//
//   1. Load both files for each cell.
//   2. Compute the per-cell quality (0..200 scale):
//        quality = A + B            if decision == "implement" AND test apply succeeded
//                = 2 × A             if decision == "pushback"
//                = 0                 if decision == "error" / test apply failed / parse failure
//   3. Aggregate per-agent (mean across cells of that agent).
//   4. Project per-agent quality into a CurveSample (factor = qmax / quality)
//      that fit.ts's existing regression machinery can consume.
//
// This module is read-only: it consumes Phase 1c's JSON output. The shape is
// duplicated here intentionally — Phase 1d should land independently of
// Phase 1c, so we don't import from testRunner.ts / reasoningJudge.ts. Once
// both PRs merge, a follow-up cleanup can centralize the schema.
//
// Decision is inherited from each cell's envelope (already in Cell.decision
// from aggregate.ts).

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Cell, CurveSample, Decision } from "./types.js";

/**
 * Per-cell test-pass score, persisted by `vp-dev research run-tests`.
 * Schema mirrors `RunHiddenTestsResult` in testRunner.ts (Phase 1c).
 */
export interface CellTestScore {
  passed: number;
  failed: number;
  errored: number;
  total: number;
  applyCleanly: boolean;
  applyError?: string;
  runtimeMs: number;
  errorReason?: string;
}

/**
 * Per-cell judge score, persisted by `vp-dev research grade-reasoning`.
 * Schema mirrors `GradeReasoningResult` in reasoningJudge.ts (Phase 1c).
 */
export interface CellJudgeScore {
  median: number;
  scores: number[];
  variance: number;
  rationales?: string[];
  partialFailure?: boolean;
  isError: boolean;
  errorReason?: string;
}

export interface CellScores {
  cellKey: string;
  test?: CellTestScore;
  judge?: CellJudgeScore;
}

const TEST_SUFFIX = "-tests.json";
const JUDGE_SUFFIX = "-judge.json";

/**
 * Cell key encoding: `<agentId>-<issueId>`. Phase 1c CLI writes per-cell
 * JSON files at `<scoresDir>/<cellKey>{-tests,-judge}.json`. Replicates
 * (when K>1) are encoded by the operator workflow as `<agentId>-<issueId>-r<N>`.
 */
export function cellKeyFor(agentId: string, issueId: number, replicate?: number): string {
  if (replicate != null) return `${agentId}-${issueId}-r${replicate}`;
  return `${agentId}-${issueId}`;
}

/**
 * Load all per-cell score JSONs from `scoresDir`. Files are matched by
 * suffix (`-tests.json`, `-judge.json`). Cells with only one of the two
 * appear with the other side undefined; downstream `qualityFromAB`
 * scores them as 0 (incomplete data).
 */
export async function loadCellScores(scoresDir: string): Promise<Map<string, CellScores>> {
  const out = new Map<string, CellScores>();
  let files: string[];
  try {
    files = await fs.readdir(scoresDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return out;
    throw err;
  }
  for (const f of files) {
    let cellKey: string;
    let kind: "test" | "judge";
    if (f.endsWith(TEST_SUFFIX)) {
      cellKey = f.slice(0, -TEST_SUFFIX.length);
      kind = "test";
    } else if (f.endsWith(JUDGE_SUFFIX)) {
      cellKey = f.slice(0, -JUDGE_SUFFIX.length);
      kind = "judge";
    } else {
      continue;
    }
    let bucket = out.get(cellKey);
    if (!bucket) {
      bucket = { cellKey };
      out.set(cellKey, bucket);
    }
    try {
      const raw = await fs.readFile(path.join(scoresDir, f), "utf-8");
      const parsed = JSON.parse(raw);
      if (kind === "test") bucket.test = parsed as CellTestScore;
      else bucket.judge = parsed as CellJudgeScore;
    } catch {
      // Malformed JSON — leave the bucket's slot undefined. Downstream
      // qualityFromAB will score this cell as 0.
    }
  }
  return out;
}

/**
 * The 0..200 quality formula:
 *   - implement: A + B (full range when test+judge both succeeded)
 *   - pushback:  2 × A (no diff to test; double the judge score so the
 *     range is comparable to implement)
 *   - error / missing data / dirty test apply: 0
 *
 * Inputs:
 *   decision    — from Cell.decision (envelope-reported)
 *   judge       — from CellScores.judge (Phase 1c reasoningJudge output)
 *   test        — from CellScores.test (Phase 1c testRunner output)
 *
 * `applyCleanly: false` zeroes the cell even when the judge ran cleanly,
 * because the test signal is structurally untrustworthy.
 */
export function qualityFromAB(args: {
  decision: Decision | null;
  judge?: CellJudgeScore;
  test?: CellTestScore;
}): number {
  if (args.decision === "error" || args.decision === "error_max_turns" || args.decision == null) {
    return 0;
  }
  const A = args.judge && !args.judge.isError ? clamp(args.judge.median, 0, 100) : null;
  if (args.decision === "pushback") {
    if (A == null) return 0;
    return 2 * A;
  }
  // implement
  if (A == null) return 0;
  if (!args.test || !args.test.applyCleanly || args.test.errorReason) return 0;
  if (args.test.total <= 0) return 0;
  // B is reported as a count out of `total`; normalize to 0..100 even if
  // total != 100 (the operator might have used a different cap during
  // smoke runs).
  const B = clamp((args.test.passed / args.test.total) * 100, 0, 100);
  return A + B;
}

function clamp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(lo, Math.min(hi, x));
}

/**
 * Project per-cell quality into per-agent CurveSamples. For each agent,
 * average the cell qualities; convert to a degradation factor anchored
 * at 1.0 against the agent with the highest mean quality.
 *
 * Cells without a matching CellScores entry contribute 0 (incomplete
 * data) — the same treatment as a structurally-failed cell. Caller can
 * filter `cells` upstream if a different policy is needed.
 *
 * Empty input → empty output. Single-agent input → single sample with
 * factor=1.
 */
export function samplesFromCellScores(
  cells: ReadonlyArray<Cell>,
  cellScores: Map<string, CellScores>,
): CurveSample[] {
  if (cells.length === 0) return [];
  // Group quality_per_cell by agent.
  const perAgent = new Map<string, { sizeBytes: number; qualities: number[] }>();
  for (const c of cells) {
    const key = cellKeyFor(c.agentId, c.issueId);
    const scores = cellScores.get(key);
    const q = qualityFromAB({
      decision: c.decision,
      judge: scores?.judge,
      test: scores?.test,
    });
    let bucket = perAgent.get(c.agentId);
    if (!bucket) {
      bucket = { sizeBytes: c.agentSizeBytes, qualities: [] };
      perAgent.set(c.agentId, bucket);
    }
    bucket.qualities.push(q);
  }
  const meanByAgent = [...perAgent.entries()]
    .map(([agentId, b]) => ({
      agentId,
      sizeBytes: b.sizeBytes,
      meanQuality: b.qualities.reduce((s, x) => s + x, 0) / b.qualities.length,
    }))
    .sort((a, b) => a.sizeBytes - b.sizeBytes);
  const qmax = Math.max(...meanByAgent.map((a) => a.meanQuality));
  if (!(qmax > 0)) {
    // Every cell scored 0 — degenerate. Return all-1 factors so the
    // caller's regression sees something fittable rather than NaN.
    return meanByAgent.map((a) => ({ xBytes: a.sizeBytes, factor: 1 }));
  }
  return meanByAgent.map((a) => ({
    xBytes: a.sizeBytes,
    factor: a.meanQuality > 0 ? Math.max(1, qmax / a.meanQuality) : Number.POSITIVE_INFINITY,
  }));
}
