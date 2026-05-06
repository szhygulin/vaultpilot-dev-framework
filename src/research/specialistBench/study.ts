// Top-level orchestration for the specialist-pick benchmark (#179
// experiment 2). Mirrors `src/research/curveStudy/study.ts`'s shape:
//   1. Dispatch the treatment arm (this benchmark)
//   2. Aggregate treatment + control cells from logs
//   3. Pair by issue, compute paired diffs (cost + quality)
//   4. Run statistical tests (Wilcoxon paired one-sided + Holm-Bonferroni
//      adjustment + Hedges' g effect size)
//   5. Emit a JSON proposal the operator hand-merges into a writeup.

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  pairByIssue,
  readBenchCells,
  type BenchCell,
  type PairedDifference,
} from "./aggregate.js";
import {
  hedgesG,
  holmBonferroni,
  median,
  wilcoxonSignedRankPaired,
  type WilcoxonResult,
} from "./stats.js";
import {
  runBenchDispatch,
  type BenchDispatchInput,
  type BenchDispatchOutcome,
} from "./dispatch.js";

export interface StudyInput {
  issueIds: ReadonlyArray<number>;
  targetRepo: string;
  clonePath: string;
  /** K replicates per issue. Default 3. */
  replicates?: number;
  /** Where treatment-arm per-cell logs land. */
  logsDir: string;
  /** Where to read experiment-1 control cells from. */
  controlLogsDirs: ReadonlyArray<string>;
  /** Filename prefix used by the control logs (curveStudy uses `curveStudy-`). */
  controlPrefix?: string;
  /** Where to write the JSON output. */
  outputPath: string;
  cwd: string;
  maxTotalCostUsd?: number;
  /** Forwarded to dispatch + aggregate (testability). */
  fetchIssueLabels?: BenchDispatchInput["fetchIssueLabels"];
  spawnCell?: BenchDispatchInput["spawnCell"];
  regOverride?: BenchDispatchInput["regOverride"];
  /** Skip dispatch and read existing treatment logs (for re-aggregation runs). */
  skipDispatch?: boolean;
  onEvent?: BenchDispatchInput["onEvent"];
}

export type WilcoxonAlternative = "less" | "greater";

export interface StudyOutput {
  generatedAt: string;
  targetRepo: string;
  issueIds: ReadonlyArray<number>;
  replicates: number;
  /** The picker's choice per issue + the score it received. */
  picks: BenchDispatchOutcome["picks"];
  /** Treatment cells (specialist arm). */
  treatmentCells: ReadonlyArray<BenchCell>;
  /** Control cells (experiment 1's trim arm). */
  controlCells: ReadonlyArray<BenchCell>;
  /** Per-issue paired differences. */
  pairs: ReadonlyArray<PairedDifference>;
  cost: WilcoxonReport;
  quality: WilcoxonReport;
  /** Holm-Bonferroni adjusted p-values (cost first, quality second; same order as the array). */
  holmAdjusted: { cost: number; quality: number; bothReject: boolean };
  /** Effect sizes (Hedges' g, paired). */
  effectSize: { cost: number; quality: number };
  /** Within-specialist coefficient-of-variation summary. */
  cvSummary: { medianCv: number; maxCv: number; flaggedIssues: number[] };
  budgetExhausted: boolean;
}

export interface WilcoxonReport {
  test: WilcoxonResult;
  /** Alternative that was tested (one-sided direction). */
  alternative: WilcoxonAlternative;
  /** Median of the per-issue paired differences. */
  medianDiff: number;
  /** Mean specialist value across issues (for context). */
  meanSpecialist: number;
  /** Mean control value across issues. */
  meanControl: number;
}

const DEFAULT_REPLICATES = 3;
const HIGH_CV_THRESHOLD = 0.3;

export async function runSpecialistBench(input: StudyInput): Promise<StudyOutput> {
  const replicates = input.replicates ?? DEFAULT_REPLICATES;
  const generatedAt = new Date().toISOString();

  // 1. Dispatch (or skip and re-aggregate).
  let picks: BenchDispatchOutcome["picks"] = [];
  if (!input.skipDispatch) {
    const dispatchOutcome = await runBenchDispatch({
      issueIds: input.issueIds,
      targetRepo: input.targetRepo,
      clonePath: input.clonePath,
      replicates,
      logsDir: input.logsDir,
      cwd: input.cwd,
      maxTotalCostUsd: input.maxTotalCostUsd,
      fetchIssueLabels: input.fetchIssueLabels,
      spawnCell: input.spawnCell,
      regOverride: input.regOverride,
      onEvent: input.onEvent,
    });
    picks = dispatchOutcome.picks;
  }

  // 2. Aggregate treatment + control cells.
  const treatmentCells = await readBenchCells({
    logsDir: input.logsDir,
    prefix: "bench-r",
    replicateExtractor: (filename) => {
      const m = filename.match(/^bench-r(\d+)-/);
      return m ? Number(m[1]) : undefined;
    },
  });
  const controlPrefix = input.controlPrefix ?? "curveStudy-";
  const controlCells: BenchCell[] = [];
  for (const dir of input.controlLogsDirs) {
    const dirCells = await readBenchCells({ logsDir: dir, prefix: controlPrefix });
    controlCells.push(...dirCells);
  }

  // 3. Pair by issue + compute diffs.
  const pairs = pairByIssue(controlCells, treatmentCells);

  // 4. Run Wilcoxon on cost (alternative=less) + quality (alternative=greater).
  const dCost = pairs.map((p) => p.dCost);
  const dQuality = pairs.map((p) => p.dQuality);
  const costTest = wilcoxonSignedRankPaired(dCost, "less");
  const qualityTest = wilcoxonSignedRankPaired(dQuality, "greater");

  const costReport: WilcoxonReport = {
    test: costTest,
    alternative: "less",
    medianDiff: pairs.length === 0 ? Number.NaN : median(dCost),
    meanSpecialist:
      pairs.length === 0 ? Number.NaN : pairs.reduce((s, p) => s + p.specialistMeanCostUsd, 0) / pairs.length,
    meanControl:
      pairs.length === 0 ? Number.NaN : pairs.reduce((s, p) => s + p.trimMedianCostUsd, 0) / pairs.length,
  };
  const qualityReport: WilcoxonReport = {
    test: qualityTest,
    alternative: "greater",
    medianDiff: pairs.length === 0 ? Number.NaN : median(dQuality),
    meanSpecialist:
      pairs.length === 0 ? Number.NaN : pairs.reduce((s, p) => s + p.specialistMeanQuality, 0) / pairs.length,
    meanControl:
      pairs.length === 0 ? Number.NaN : pairs.reduce((s, p) => s + p.trimMeanQuality, 0) / pairs.length,
  };

  // 5. Holm-Bonferroni adjustment of the two p-values.
  const holm = holmBonferroni([costTest.pValue, qualityTest.pValue], 0.05);
  const holmAdjusted = {
    cost: holm.adjusted[0],
    quality: holm.adjusted[1],
    bothReject: holm.rejects[0] && holm.rejects[1],
  };

  // 6. Effect sizes.
  const effectSize = {
    cost: hedgesG(dCost),
    quality: hedgesG(dQuality),
  };

  // 7. CV summary across replicates per issue.
  const cvs = pairs.map((p) => p.specialistCostCv).filter((c) => Number.isFinite(c));
  const cvSummary = {
    medianCv: cvs.length === 0 ? Number.NaN : median(cvs),
    maxCv: cvs.length === 0 ? Number.NaN : Math.max(...cvs),
    flaggedIssues: pairs
      .filter((p) => Number.isFinite(p.specialistCostCv) && p.specialistCostCv > HIGH_CV_THRESHOLD)
      .map((p) => p.issueId),
  };

  const output: StudyOutput = {
    generatedAt,
    targetRepo: input.targetRepo,
    issueIds: [...input.issueIds],
    replicates,
    picks,
    treatmentCells,
    controlCells,
    pairs,
    cost: costReport,
    quality: qualityReport,
    holmAdjusted,
    effectSize,
    cvSummary,
    budgetExhausted: false,
  };

  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  await fs.writeFile(input.outputPath, JSON.stringify(output, null, 2));

  return output;
}

export function formatBenchReport(out: StudyOutput): string {
  const lines: string[] = [];
  lines.push(`Specialist-pick benchmark (K=${out.replicates} replicates)`);
  lines.push(
    `  treatment: ${out.treatmentCells.length} specialist cells (${out.issueIds.length} issues × ${out.replicates} replicates)`,
  );
  lines.push(`  control:   ${out.controlCells.length} trim cells from experiment 1`);
  lines.push("");
  if (out.pairs.length === 0) {
    lines.push("  No paired observations — treatment + control don't share any issue IDs.");
    return lines.join("\n");
  }
  lines.push(
    `  cost (USD): specialist mean = ${out.cost.meanSpecialist.toFixed(3)}, trim median = ${out.cost.meanControl.toFixed(3)} (n=${out.pairs.length} pairs)`,
  );
  lines.push(
    `    paired Wilcoxon: W+ = ${out.cost.test.wPlus.toFixed(1)}, p = ${out.cost.test.pValue.toExponential(2)} (one-sided, H1: specialist < trim)`,
  );
  lines.push(
    `    Hedges' g = ${out.effectSize.cost.toFixed(2)}  (negative = specialists cheaper)`,
  );
  lines.push("");
  lines.push(
    `  quality (heuristic 0/0.5/1): specialist mean = ${out.quality.meanSpecialist.toFixed(3)}, trim mean = ${out.quality.meanControl.toFixed(3)}`,
  );
  lines.push(
    `    paired Wilcoxon: W+ = ${out.quality.test.wPlus.toFixed(1)}, p = ${out.quality.test.pValue.toExponential(2)} (one-sided, H1: specialist > trim)`,
  );
  lines.push(
    `    Hedges' g = ${out.effectSize.quality.toFixed(2)}  (positive = specialists higher quality)`,
  );
  lines.push("");
  lines.push(
    `  Holm-Bonferroni (α=0.05): cost adj-p = ${out.holmAdjusted.cost.toExponential(2)}, quality adj-p = ${out.holmAdjusted.quality.toExponential(2)}`,
  );
  lines.push(
    out.holmAdjusted.bothReject
      ? `  Both tests reject. Specialty matching is supported.`
      : `  At least one test does not reject. See per-test details + within-specialist CV.`,
  );
  lines.push("");
  lines.push(
    `  within-specialist CV (cost): median = ${out.cvSummary.medianCv.toFixed(3)}, max = ${out.cvSummary.maxCv.toFixed(3)}`,
  );
  if (out.cvSummary.flaggedIssues.length > 0) {
    lines.push(
      `  flagged (CV > ${HIGH_CV_THRESHOLD}): issue(s) ${out.cvSummary.flaggedIssues.join(", ")} — replicate spread is large; per-issue paired diff is noisy`,
    );
  }
  return lines.join("\n");
}
