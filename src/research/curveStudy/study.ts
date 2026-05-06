import { promises as fs } from "node:fs";
import path from "node:path";
import { dispatchCells, type CellSpec } from "./dispatch.js";
import { aggregateLogsDir } from "./aggregate.js";
import { scoreAllAgents } from "./score.js";
import { mergeSamples, samplesFromScores } from "./fit.js";
import { fitPolynomialRegression, type PolynomialRegression } from "./regression.js";
import type { Cell, CurveSample, QualityScore, RubricScore } from "./types.js";

export type StudyMode = "replace" | "update";
export type CollisionPolicy = "replace-on-collision" | "average-on-collision" | "keep-both";

/**
 * Top-level orchestration of a curve study.
 *
 * Operator-input model: the operator pre-trims the parent dev-agent into N
 * forks at chosen byte budgets and registers them. This tool receives
 * (devAgentId, sizeBytes, clonePath) triples + an issue list, dispatches with
 * 4-way parallelism + per-devAgent serialization, aggregates, scores, fits a
 * polynomial regression, and writes a JSON proposal at outputPath.
 *
 * Mode `replace`: proposal contains only the freshly-measured samples.
 * Mode `update`: proposal merges the fresh samples into `existingSamples`
 *   (or reads them from `src/util/contextCostCurve.ts` if not passed) and
 *   re-fits the regression on the union.
 *
 * The operator hand-merges `samples` + `regression` into
 * `src/util/contextCostCurve.ts`. We deliberately don't rewrite that file
 * from inside the tool — the operator should review the fitted shape +
 * residual error before the curve is committed.
 */
export interface StudyInput {
  agents: ReadonlyArray<{ devAgentId: string; sizeBytes: number; clonePath: string }>;
  issues: ReadonlyArray<number>;
  targetRepo: string;
  parallelism?: number;
  dryRun?: boolean;
  logsDir: string;
  outputPath: string;
  cwd: string;
  rubrics?: RubricScore[];
  /** Default "replace". "update" merges fresh samples with existingSamples. */
  mode?: StudyMode;
  /** Polynomial regression degree. Default 2. */
  regressionDegree?: number;
  /** Existing samples to merge against (only used when mode="update"). If
   *  undefined and mode="update", caller is expected to load them from
   *  src/util/contextCostCurve.ts and pass via this field. */
  existingSamples?: ReadonlyArray<CurveSample>;
  /** Default "replace-on-collision". */
  collisionPolicy?: CollisionPolicy;
}

export interface StudyOutput {
  cells: Cell[];
  scores: QualityScore[];
  /** Fresh samples derived from this run (always; regardless of mode). */
  freshSamples: CurveSample[];
  /** Final samples in the proposal (= freshSamples in replace mode, merged in update mode). */
  samples: CurveSample[];
  regression: PolynomialRegression | null;
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

  const freshSamples = samplesFromScores(scores);
  const samples =
    mode === "update"
      ? mergeSamples(input.existingSamples ?? [], freshSamples, input.collisionPolicy)
      : freshSamples;

  let regression: PolynomialRegression | null = null;
  if (samples.length > regressionDegree) {
    regression = fitPolynomialRegression(samples, regressionDegree);
  }

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
        freshSamples,
        samples,
        regression,
      },
      null,
      2,
    ),
  );

  return { cells: allCells, scores, freshSamples, samples, regression, totalCostUsd, wallMs, mode };
}
