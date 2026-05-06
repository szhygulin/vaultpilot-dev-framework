// Aggregator for the specialist-pick benchmark (#179 experiment 2).
//
// Reads (agent, issue, decision, cost) tuples from two log directories:
//   - control: experiment 1's per-cell logs (18 trims × 13 issues = 234 cells)
//   - treatment: experiment 2's per-cell logs (1 specialist × 13 issues × K
//     replicates)
//
// Pairs by issue, applies the implement=1 / pushback=0.5 / error=0
// quality heuristic, computes per-issue paired differences (specialist −
// trim baseline). Hands the diffs to stats.ts.
//
// We don't reuse `aggregateLogsDir` from curveStudy because it requires an
// agent→size map and skips agents missing from it; here we don't care
// about sizes, and treatment specialists are NOT in the trim agent map.
// Instead we walk the directory ourselves with the same regex shape.

import { promises as fs } from "node:fs";
import path from "node:path";
import { aggregateLog } from "../curveStudy/aggregate.js";
import type { Cell } from "../curveStudy/types.js";
import { coefficientOfVariation, mean, median } from "./stats.js";

export interface BenchCell {
  agentId: string;
  issueId: number;
  decision: string | null;
  costUsd: number;
  durationMs: number;
  isError: boolean;
  /** Replicate index for treatment cells (1..K). Undefined for control cells (each is unique by agent). */
  replicate?: number;
  /** Path to the log file the cell was parsed from. */
  log: string;
}

export interface PairedDifference {
  issueId: number;
  /** Mean cost of the K=N specialist replicates for this issue. */
  specialistMeanCostUsd: number;
  /** Median cost of the trim baseline (18 trims) for this issue. */
  trimMedianCostUsd: number;
  /** d_cost = specialist - trim. Negative = specialists are cheaper. */
  dCost: number;
  /** Mean quality of the K=N specialist replicates (heuristic). */
  specialistMeanQuality: number;
  /** Mean quality of the trim baseline (heuristic). */
  trimMeanQuality: number;
  /** d_quality = specialist - trim. Positive = specialists score higher. */
  dQuality: number;
  /** Coefficient of variation of cost across the K specialist replicates. */
  specialistCostCv: number;
  /** Number of specialist replicates contributing to this issue's pair. */
  specialistReplicateCount: number;
  /** Number of trim cells contributing (typically 18). */
  trimCellCount: number;
}

/**
 * Walk a logs directory and return every (agent, issue, decision, cost) cell
 * matching the curve-study filename shape `<prefix>agent-<...>-<issue>.log`.
 *
 * `replicateExtractor` lets the treatment-side caller derive a replicate
 * index from the filename or other context (e.g., counting prior specialist
 * cells for the same issue). For control cells we omit it.
 */
export async function readBenchCells(opts: {
  logsDir: string;
  prefix: string;
  replicateExtractor?: (filename: string) => number | undefined;
}): Promise<BenchCell[]> {
  const files = await fs.readdir(opts.logsDir).catch((): string[] => []);
  const re = new RegExp(`^${opts.prefix}(agent-[a-z0-9-]+)-(\\d+)\\.log$`);
  const out: BenchCell[] = [];
  for (const f of files.sort()) {
    const m = re.exec(f);
    if (!m) continue;
    const agentId = m[1];
    const issueId = Number(m[2]);
    const cell = await aggregateLog({
      logPath: path.join(opts.logsDir, f),
      agentId,
      agentSizeBytes: 0, // unused by this benchmark
      issueId,
    });
    if (!cell) continue;
    out.push({
      agentId: cell.agentId,
      issueId: cell.issueId,
      decision: cell.decision,
      costUsd: cell.costUsd,
      durationMs: cell.durationMs,
      isError: cell.isError,
      replicate: opts.replicateExtractor?.(f),
      log: cell.log,
    });
  }
  return out;
}

/** Quality heuristic — see plan §"Quality metric". */
export function qualityFromDecision(decision: string | null): number {
  if (decision === "implement") return 1.0;
  if (decision === "pushback") return 0.5;
  // null / "error" / anything else → 0.0
  return 0.0;
}

/**
 * Group cells by issue, returning a map issueId → cells. Order within each
 * group is preserved (for stable replicate-index assignment downstream).
 */
export function groupByIssue<T extends { issueId: number }>(
  cells: ReadonlyArray<T>,
): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const c of cells) {
    let bucket = out.get(c.issueId);
    if (!bucket) {
      bucket = [];
      out.set(c.issueId, bucket);
    }
    bucket.push(c);
  }
  return out;
}

/**
 * For each issue that appears in BOTH arms, compute the paired difference
 * (specialist mean − trim median for cost; specialist mean − trim mean for
 * quality). Issues missing from either arm are silently skipped — caller
 * decides whether that's an error or expected.
 *
 * Returns the paired-diff array sorted by issue ID.
 */
export function pairByIssue(
  controlCells: ReadonlyArray<BenchCell>,
  treatmentCells: ReadonlyArray<BenchCell>,
): PairedDifference[] {
  const controlByIssue = groupByIssue(controlCells);
  const treatmentByIssue = groupByIssue(treatmentCells);

  const out: PairedDifference[] = [];
  // Use the intersection of issue IDs that appear in BOTH arms.
  const bothArms = [...treatmentByIssue.keys()].filter((id) =>
    controlByIssue.has(id),
  );
  bothArms.sort((a, b) => a - b);

  for (const issueId of bothArms) {
    const tCells = treatmentByIssue.get(issueId)!;
    const cCells = controlByIssue.get(issueId)!;
    const tCosts = tCells.map((c) => c.costUsd);
    const cCosts = cCells.map((c) => c.costUsd);
    const tQual = tCells.map((c) => qualityFromDecision(c.decision));
    const cQual = cCells.map((c) => qualityFromDecision(c.decision));

    const specialistMeanCost = mean(tCosts);
    const trimMedianCost = median(cCosts);
    const specialistMeanQuality = mean(tQual);
    const trimMeanQuality = mean(cQual);

    out.push({
      issueId,
      specialistMeanCostUsd: specialistMeanCost,
      trimMedianCostUsd: trimMedianCost,
      dCost: specialistMeanCost - trimMedianCost,
      specialistMeanQuality,
      trimMeanQuality,
      dQuality: specialistMeanQuality - trimMeanQuality,
      specialistCostCv: coefficientOfVariation(tCosts),
      specialistReplicateCount: tCells.length,
      trimCellCount: cCells.length,
    });
  }
  return out;
}

/** Convenience overload that takes a curveStudy `Cell[]` (e.g. from `aggregateLogsDir`). */
export function cellsToBenchCells(cells: ReadonlyArray<Cell>): BenchCell[] {
  return cells.map((c) => ({
    agentId: c.agentId,
    issueId: c.issueId,
    decision: c.decision,
    costUsd: c.costUsd,
    durationMs: c.durationMs,
    isError: c.isError,
    log: c.log,
  }));
}
