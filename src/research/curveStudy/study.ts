import { promises as fs } from "node:fs";
import path from "node:path";
import { dispatchCells, type CellSpec } from "./dispatch.js";
import { aggregateLogsDir } from "./aggregate.js";
import { scoreAllAgents } from "./score.js";
import { fitFromQualityScores } from "./fit.js";
import type { Cell, CurveBreakpoint, QualityScore, RubricScore } from "./types.js";

/**
 * Top-level orchestration of a curve study.
 *
 * Operator-input model: the operator pre-trims their parent dev-agent into N
 * forks at chosen byte-budgets and registers them in the registry. This tool
 * receives the (devAgentId, sizeBytes, clonePath) triples and the issue list,
 * then dispatches, aggregates, scores, and fits.
 *
 * Apply flow: emits a JSON proposal at `outputPath`. The operator hand-merges
 * the breakpoints into `src/util/contextCostCurve.ts`. We deliberately don't
 * rewrite that file from inside the tool — the operator should review the
 * fitted shape (and the residual error against the data points) before the
 * curve is committed.
 */
export interface StudyInput {
  /** One entry per dev-agent under study. clonePath must be a dedicated clone of targetRepo. */
  agents: ReadonlyArray<{ devAgentId: string; sizeBytes: number; clonePath: string }>;
  /** GitHub issue numbers in the target-repo to dispatch each agent against. */
  issues: ReadonlyArray<number>;
  targetRepo: string;
  /** Max concurrent research agents. Default 4. */
  parallelism?: number;
  /** Pass --dry-run to vp-dev spawn (intercepts push/PR side effects). Default true. */
  dryRun?: boolean;
  /** Where per-cell logs land. */
  logsDir: string;
  /** Where the JSON proposal is written. */
  outputPath: string;
  /** Working dir for npm/vp-dev spawn. */
  cwd: string;
  /** Optional operator rubrics (pushback-accuracy / PR-correctness 0-or-1 per cell). */
  rubrics?: RubricScore[];
}

export interface StudyOutput {
  cells: Cell[];
  scores: QualityScore[];
  breakpoints: CurveBreakpoint[];
  /** Sum of costUsd across all cells. */
  totalCostUsd: number;
  /** Wall time of the dispatch loop. */
  wallMs: number;
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
        process.stderr.write(`[${ts}] ${e.cell.devAgentId} #${e.cell.issueId} start (clone=${e.cell.clonePath})\n`);
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

  let breakpoints: CurveBreakpoint[] = [];
  if (scores.length >= 3) {
    breakpoints = fitFromQualityScores(scores).breakpoints;
  }

  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  await fs.writeFile(
    input.outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        targetRepo: input.targetRepo,
        issues: [...input.issues],
        agents: [...input.agents],
        cellCount: allCells.length,
        totalCostUsd,
        wallMs,
        scores,
        breakpoints,
      },
      null,
      2,
    ),
  );

  return { cells: allCells, scores, breakpoints, totalCostUsd, wallMs };
}
