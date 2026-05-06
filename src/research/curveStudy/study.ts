import { promises as fs } from "node:fs";
import path from "node:path";
import { dispatchCells, type CellSpec } from "./dispatch.js";
import { aggregateLogsDir } from "./aggregate.js";
import { scoreAllAgents } from "./score.js";
import { mergeSamples, samplesFromCost, samplesFromScores } from "./fit.js";
import { fitPolynomialRegression, type PolynomialRegression } from "./regression.js";
import type { Cell, CurveSample, QualityScore, RubricScore } from "./types.js";

export type StudyMode = "replace" | "update";
export type CollisionPolicy = "replace-on-collision" | "average-on-collision" | "keep-both";

/**
 * Top-level orchestration of a curve study. Fits two curves from the same
 * dispatch:
 *   - Accuracy-degradation: factor = qualityMax / quality(agent)
 *   - Token-cost: factor = meanCost(agent) / minMeanCost
 *
 * Mode `replace`: proposal contains only the freshly-measured samples for
 *   each curve.
 * Mode `update`: merges fresh samples into the existing samples (passed via
 *   `existingAccuracySamples` / `existingTokenCostSamples`) and re-fits.
 *
 * The operator hand-merges both arrays + provenance into
 * `src/util/contextCostCurve.ts`. We deliberately don't rewrite that file
 * from inside the tool — operator should review fits + p-values first.
 */
export interface StudyInput {
  agents: ReadonlyArray<{ devAgentId: string; sizeBytes: number; clonePath: string }>;
  issues: ReadonlyArray<number>;
  targetRepo: string;
  parallelism?: number;
  dryRun?: boolean;
  /** Forward to spawn — required when issues include closed-completed picks. */
  allowClosedIssue?: boolean;
  /** Forward to spawn — required for closed-issue dispatches to avoid leaking the resolution PR. */
  issueBodyOnly?: boolean;
  logsDir: string;
  outputPath: string;
  cwd: string;
  rubrics?: RubricScore[];
  mode?: StudyMode;
  regressionDegree?: number;
  /** Existing accuracy samples (mode="update" reads from contextCostCurve.ts). */
  existingAccuracySamples?: ReadonlyArray<CurveSample>;
  /** Existing token-cost samples (mode="update" reads from contextCostCurve.ts). */
  existingTokenCostSamples?: ReadonlyArray<CurveSample>;
  collisionPolicy?: CollisionPolicy;
}

export interface FittedCurve {
  freshSamples: CurveSample[];
  samples: CurveSample[];
  regression: PolynomialRegression | null;
}

export interface StudyOutput {
  cells: Cell[];
  scores: QualityScore[];
  accuracy: FittedCurve;
  tokenCost: FittedCurve;
  totalCostUsd: number;
  wallMs: number;
  mode: StudyMode;
}

export async function runCurveStudy(input: StudyInput): Promise<StudyOutput> {
  const cells: CellSpec[] = [];
  for (const a of input.agents) {
    for (const issue of input.issues) {
      cells.push({ devAgentId: a.devAgentId, issueId: issue, clonePath: a.clonePath });
    }
  }
  const sizesByAgent = new Map<string, number>(
    input.agents.map((a) => [a.devAgentId, a.sizeBytes]),
  );
  const mode: StudyMode = input.mode ?? "replace";
  const regressionDegree = input.regressionDegree ?? 2;

  const t0 = Date.now();
  const logPrefix = "curveStudy-";
  await dispatchCells({
    cells,
    targetRepo: input.targetRepo,
    parallelism: input.parallelism ?? 4,
    dryRun: input.dryRun ?? true,
    allowClosedIssue: input.allowClosedIssue,
    issueBodyOnly: input.issueBodyOnly,
    logsDir: input.logsDir,
    logPrefix,
    cwd: input.cwd,
    onEvent: (e) => {
      const ts = e.t.toISOString().slice(11, 19);
      if (e.kind === "start") {
        process.stderr.write(
          `[${ts}] ${e.cell.devAgentId} #${e.cell.issueId} start (clone=${e.cell.clonePath})\n`,
        );
      } else {
        process.stderr.write(`[${ts}] ${e.cell.devAgentId} #${e.cell.issueId} done (rc=${e.rc})\n`);
      }
    },
  });
  const wallMs = Date.now() - t0;

  const allCells = await aggregateLogsDir({
    logsDir: input.logsDir,
    prefix: logPrefix,
    agentSizes: sizesByAgent,
  });
  const scores = scoreAllAgents(allCells, input.rubrics);
  const totalCostUsd = allCells.reduce((s, c) => s + c.costUsd, 0);

  // Accuracy curve: from per-agent quality scores
  const freshAccuracy = samplesFromScores(scores);
  const finalAccuracy =
    mode === "update"
      ? mergeSamples(input.existingAccuracySamples ?? [], freshAccuracy, input.collisionPolicy)
      : freshAccuracy;
  const accuracyRegression =
    finalAccuracy.length > regressionDegree
      ? safeFit(finalAccuracy, regressionDegree)
      : null;

  // Token-cost curve: from per-cell costUsd, filtered to non-error cells
  const completedCells = allCells
    .filter((c) => c.decision === "implement" || c.decision === "pushback")
    .map((c) => ({
      agentId: c.agentId,
      agentSizeBytes: c.agentSizeBytes,
      costUsd: c.costUsd,
    }));
  const freshTokenCost = samplesFromCost(completedCells);
  const finalTokenCost =
    mode === "update"
      ? mergeSamples(
          input.existingTokenCostSamples ?? [],
          freshTokenCost,
          input.collisionPolicy,
        )
      : freshTokenCost;
  const tokenCostRegression =
    finalTokenCost.length > regressionDegree
      ? safeFit(finalTokenCost, regressionDegree)
      : null;

  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  await fs.writeFile(
    input.outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode,
        targetRepo: input.targetRepo,
        issues: [...input.issues],
        agents: [...input.agents],
        cellCount: allCells.length,
        totalCostUsd,
        wallMs,
        scores,
        accuracy: {
          freshSamples: freshAccuracy,
          samples: finalAccuracy,
          regression: accuracyRegression,
        },
        tokenCost: {
          freshSamples: freshTokenCost,
          samples: finalTokenCost,
          regression: tokenCostRegression,
        },
      },
      null,
      2,
    ),
  );

  return {
    cells: allCells,
    scores,
    accuracy: {
      freshSamples: freshAccuracy,
      samples: finalAccuracy,
      regression: accuracyRegression,
    },
    tokenCost: {
      freshSamples: freshTokenCost,
      samples: finalTokenCost,
      regression: tokenCostRegression,
    },
    totalCostUsd,
    wallMs,
    mode,
  };
}

function safeFit(samples: CurveSample[], degree: number): PolynomialRegression | null {
  try {
    return fitPolynomialRegression(samples, degree);
  } catch {
    // Degenerate inputs (zero variance in y, etc.) — surface null so callers
    // can flag the curve as unfittable rather than crash.
    return null;
  }
}
