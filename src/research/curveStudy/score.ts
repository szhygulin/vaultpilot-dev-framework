import type { Cell, QualityScore, RubricScore } from "./types.js";

/**
 * Outcome-quality composite per #179:
 *   quality = 0.40 * implement_rate
 *           + 0.25 * pushback_accuracy_rate
 *           + 0.20 * (1 - error_max_turns_rate)
 *           + 0.15 * pr_correctness_rate
 *
 * Rubric scores are operator-supplied 0/1 judgments. Defaults when missing:
 *   - pushback_accuracy: 1 if cell.decision==="pushback", else 0
 *   - pr_correctness:    1 if cell.decision==="implement", else 0
 *
 * The defaults assume "outcome bucket = right answer." Real curve fitting
 * should always pass operator-judged rubrics; defaults only apply when the
 * caller deliberately wants a quick provisional score.
 */
export function scoreAgent(
  cells: Cell[],
  rubrics?: RubricScore[],
): QualityScore {
  if (cells.length === 0) throw new Error("scoreAgent: empty cells");
  const agentId = cells[0].agentId;
  const agentSizeBytes = cells[0].agentSizeBytes;
  for (const c of cells) {
    if (c.agentId !== agentId) {
      throw new Error(`scoreAgent: mixed agentIds (${agentId} vs ${c.agentId})`);
    }
  }
  const rubricByCell = new Map<string, RubricScore>();
  for (const r of rubrics ?? []) {
    if (r.agentId === agentId) {
      rubricByCell.set(`${r.agentId}:${r.issueId}`, r);
    }
  }

  let implementCount = 0;
  let pushbackCount = 0;
  let pushbackAccurate = 0;
  let errorMaxTurnsCount = 0;
  let implementCorrect = 0;

  for (const c of cells) {
    const r = rubricByCell.get(`${c.agentId}:${c.issueId}`);
    if (c.decision === "implement") {
      implementCount += 1;
      const judged = r?.prCorrectness ?? 1;
      implementCorrect += judged;
    } else if (c.decision === "pushback") {
      pushbackCount += 1;
      const judged = r?.pushbackAccuracy ?? 1;
      pushbackAccurate += judged;
    } else if (c.decision === "error_max_turns") {
      errorMaxTurnsCount += 1;
    }
  }

  const n = cells.length;
  const implementRate = implementCount / n;
  const pushbackAccuracyRate = pushbackCount === 0 ? 0 : pushbackAccurate / pushbackCount;
  const errorMaxTurnsRate = errorMaxTurnsCount / n;
  const prCorrectnessRate = implementCount === 0 ? 0 : implementCorrect / implementCount;

  const quality =
    0.40 * implementRate +
    0.25 * pushbackAccuracyRate +
    0.20 * (1 - errorMaxTurnsRate) +
    0.15 * prCorrectnessRate;

  return {
    agentId,
    agentSizeBytes,
    cellCount: n,
    implementRate,
    pushbackAccuracyRate,
    errorMaxTurnsRate,
    prCorrectnessRate,
    quality,
  };
}

export function scoreAllAgents(
  cells: Cell[],
  rubrics?: RubricScore[],
): QualityScore[] {
  const byAgent = new Map<string, Cell[]>();
  for (const c of cells) {
    let arr = byAgent.get(c.agentId);
    if (!arr) {
      arr = [];
      byAgent.set(c.agentId, arr);
    }
    arr.push(c);
  }
  const out: QualityScore[] = [];
  for (const [, agentCells] of byAgent) {
    out.push(scoreAgent(agentCells, rubrics));
  }
  out.sort((a, b) => a.agentSizeBytes - b.agentSizeBytes);
  return out;
}
