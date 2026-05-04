// Per-run accumulator for SDK-reported `total_cost_usd`.
//
// Phase 1 of the cost-ceiling design (issue #85, supersedes #34): measurement
// only — no enforcement, no `aborted-budget` terminal state, no `break` in
// `runOrchestrator()`. Phase 2 layers enforcement on top once this lands.
//
// Instantiated once in `cmdRun()` and threaded by reference into every site
// that calls the SDK's `query()` (codingAgent, dispatcher, triage). Each site
// reads `msg.total_cost_usd` from the per-result message and forwards it via
// `add(usd)`. No singleton: a fresh tracker per `cmdRun()` invocation keeps
// the run-scope explicit.
//
// Pure: no file I/O, no SDK imports, no clock. Tested in `costTracker.test.ts`.

export class RunCostTracker {
  private accumulated = 0;

  /**
   * Forward an SDK cost reading. Defensive: ignores undefined / null /
   * non-finite / negative values rather than throwing — call sites read
   * `msg.total_cost_usd` directly off SDK messages where the field can be
   * absent (older SDK versions, error subtypes), and we don't want a
   * malformed reading to corrupt the run total.
   */
  add(usd: number | undefined | null): void {
    if (usd === undefined || usd === null) return;
    if (typeof usd !== "number" || !Number.isFinite(usd) || usd < 0) return;
    this.accumulated += usd;
  }

  total(): number {
    return this.accumulated;
  }

  /**
   * Phase 1: not yet wired to enforcement. Defined here so Phase 2 can
   * adopt without a breaking API change. Returns false on a malformed
   * budget so callers can blindly delegate to it.
   */
  exceedsBudget(budgetUsd: number): boolean {
    if (!Number.isFinite(budgetUsd) || budgetUsd < 0) return false;
    return this.accumulated > budgetUsd;
  }
}

/**
 * Resolve the active per-run cost budget. CLI flag wins, env var
 * (`VP_DEV_MAX_COST_USD`) is the fallback. Returns `undefined` when neither
 * is set — the caller then knows there's no budget and skips the
 * (Phase-2-eventual) enforcement check entirely.
 *
 * Both sources are user-supplied text; rejects empty strings, non-finite
 * values, and negatives by returning `undefined` rather than throwing.
 * Phase-2 enforcement should surface a single warning when a user passes
 * a malformed flag — for Phase 1 the silent fallback is fine because the
 * value is only logged, not enforced.
 */
export function resolveBudgetUsd(opts: {
  flag?: string | number;
  env: NodeJS.ProcessEnv;
}): number | undefined {
  const fromFlag = parseUsd(opts.flag);
  if (fromFlag !== undefined) return fromFlag;
  return parseUsd(opts.env.VP_DEV_MAX_COST_USD);
}

function parseUsd(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "number" && typeof raw !== "string") return undefined;
  if (typeof raw === "string" && raw.trim().length === 0) return undefined;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}
