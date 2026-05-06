import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_UTILITY_COST_RATIO,
  evaluatePredictedUtilityGate,
  resolveUtilityCostRatio,
  type UtilityGateInput,
} from "./runIssueCore.js";
import type { Logger } from "../log/logger.js";

const stubLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as Logger;

function input(
  overrides: Partial<UtilityGateInput> = {},
): UtilityGateInput {
  return {
    agentId: "agent-test",
    issueId: 1,
    headingLength: 50,
    bodyLength: 500,
    logger: stubLogger,
    ...overrides,
  };
}

// -----------------------------------------------------------------------
// Pass-through paths
// -----------------------------------------------------------------------

test("evaluatePredictedUtilityGate: undefined predictedUtility lets through", () => {
  const result = evaluatePredictedUtilityGate(input({ predictedUtility: undefined }));
  assert.equal(result.kind, "let-through");
  if (result.kind === "let-through") assert.equal(result.reason, "no-utility");
});

test("evaluatePredictedUtilityGate: empty CLAUDE.md (cost=0) lets through any utility ≥ 0", () => {
  const result = evaluatePredictedUtilityGate(
    input({ predictedUtility: 0.0, currentClaudeMdBytes: 0 }),
  );
  assert.equal(result.kind, "let-through");
});

test("evaluatePredictedUtilityGate: high utility passes the gate at any size", () => {
  // At the upper end of the calibration range (~65 KB) costScore ≈ 1.0;
  // utility=1.0 with default ratio=1.0 produces threshold=1.0 — exactly
  // matching, the gate's `>=` comparison lets it through.
  const result = evaluatePredictedUtilityGate(
    input({ predictedUtility: 1.0, currentClaudeMdBytes: 60_000 }),
  );
  assert.equal(result.kind, "let-through");
});

// -----------------------------------------------------------------------
// Skip paths
// -----------------------------------------------------------------------

test("evaluatePredictedUtilityGate: low utility at mid-size CLAUDE.md is skipped", () => {
  // Mid-calibration size produces a non-trivial costScore. Utility=0.05
  // is below the threshold and should be skipped.
  const result = evaluatePredictedUtilityGate(
    input({ predictedUtility: 0.05, currentClaudeMdBytes: 35_000 }),
  );
  assert.equal(result.kind, "skip");
  if (result.kind === "skip") assert.equal(result.reason, "low-predicted-utility");
});

test("evaluatePredictedUtilityGate: ratio override raises the bar (no signal at high ratio)", () => {
  // At currentClaudeMdBytes=25_000 the costScore is ~0.36. Utility=0.5
  // passes with ratio=1.0 (threshold ≈ 0.36) but fails with ratio=10
  // (threshold ≈ 3.6, well above utility).
  const passInput = input({
    predictedUtility: 0.5,
    currentClaudeMdBytes: 25_000,
    ratio: 1.0,
  });
  assert.equal(evaluatePredictedUtilityGate(passInput).kind, "let-through");
  const failInput = input({
    predictedUtility: 0.5,
    currentClaudeMdBytes: 25_000,
    ratio: 10,
  });
  assert.equal(evaluatePredictedUtilityGate(failInput).kind, "skip");
});

// -----------------------------------------------------------------------
// Logging contract
// -----------------------------------------------------------------------

test("evaluatePredictedUtilityGate: always logs the decision", () => {
  const events: Array<{ event: string; data: unknown }> = [];
  const captureLogger = {
    info: (event: string, data: unknown) => events.push({ event, data }),
    warn: () => {},
    error: () => {},
    debug: () => {},
  } as unknown as Logger;

  evaluatePredictedUtilityGate(
    input({ predictedUtility: 0.7, currentClaudeMdBytes: 10_000, logger: captureLogger }),
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "specialization.utility_gate");
  const data = events[0].data as { decision: string; predictedUtility: number };
  assert.equal(data.decision, "let-through");
  assert.equal(data.predictedUtility, 0.7);
});

test("evaluatePredictedUtilityGate: log carries costScore + threshold + ratio when utility is provided", () => {
  const events: Array<Record<string, unknown>> = [];
  const captureLogger = {
    info: (_event: string, data: Record<string, unknown>) => {
      events.push(data);
    },
    warn: () => {},
    error: () => {},
    debug: () => {},
  } as unknown as Logger;

  evaluatePredictedUtilityGate(
    input({ predictedUtility: 0.7, currentClaudeMdBytes: 25_000, logger: captureLogger }),
  );
  assert.equal(events.length, 1);
  assert.equal(typeof events[0].costScore, "number");
  assert.equal(typeof events[0].threshold, "number");
  assert.equal(typeof events[0].ratio, "number");
});

// -----------------------------------------------------------------------
// resolveUtilityCostRatio
// -----------------------------------------------------------------------

test("resolveUtilityCostRatio: defaults + valid + invalid env", () => {
  assert.equal(resolveUtilityCostRatio({}), DEFAULT_UTILITY_COST_RATIO);
  assert.equal(resolveUtilityCostRatio({ VP_DEV_UTILITY_COST_RATIO: "2.0" }), 2.0);
  assert.equal(resolveUtilityCostRatio({ VP_DEV_UTILITY_COST_RATIO: "0" }), 0);
  assert.equal(
    resolveUtilityCostRatio({ VP_DEV_UTILITY_COST_RATIO: "abc" }),
    DEFAULT_UTILITY_COST_RATIO,
  );
  assert.equal(
    resolveUtilityCostRatio({ VP_DEV_UTILITY_COST_RATIO: "-1" }),
    DEFAULT_UTILITY_COST_RATIO,
  );
});
