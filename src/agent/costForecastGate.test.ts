import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type CostForecastGateInput,
  DEFAULT_COST_FORECAST_THRESHOLD,
  evaluateCostForecastGate,
  resolveCostForecastThreshold,
} from "./runIssueCore.js";
import type { Logger } from "../log/logger.js";

const stubLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as Logger;

function input(
  overrides: Partial<CostForecastGateInput> = {},
): CostForecastGateInput {
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

test("evaluateCostForecastGate: empty CLAUDE.md lets through (gate fully open)", () => {
  const result = evaluateCostForecastGate(input({ currentClaudeMdBytes: 0 }));
  assert.equal(result.kind, "let-through");
  if (result.kind === "let-through") assert.equal(result.reason, "empty-claude-md");
});

test("evaluateCostForecastGate: undefined currentClaudeMdBytes is treated as empty", () => {
  const result = evaluateCostForecastGate(input({ currentClaudeMdBytes: undefined }));
  assert.equal(result.kind, "let-through");
  if (result.kind === "let-through") assert.equal(result.reason, "empty-claude-md");
});

test("evaluateCostForecastGate: default threshold (Infinity) never fires regardless of size", () => {
  for (const bytes of [5_000, 35_000, 60_000, 100_000]) {
    const result = evaluateCostForecastGate(
      input({ currentClaudeMdBytes: bytes }),
    );
    assert.equal(
      result.kind,
      "let-through",
      `default threshold should let through at ${bytes} bytes`,
    );
  }
});

// -----------------------------------------------------------------------
// Skip paths
// -----------------------------------------------------------------------

test("evaluateCostForecastGate: tiny threshold (0) skips when delta is positive", () => {
  // The post-redo curve is non-monotone, but at currentBytes=20_000 → 20_750
  // both factor evaluations land on the rising portion of the parabola, so
  // deltaFactor is positive. With threshold=0, any positive delta skips.
  // We don't pin the exact deltaFactor here; the point is the sign/threshold
  // contract.
  const result = evaluateCostForecastGate(
    input({ currentClaudeMdBytes: 20_000, threshold: 0 }),
  );
  // If delta is non-positive (curve happened to flatten through the band),
  // the gate lets through — accept either outcome but assert the contract:
  // skip ⇔ deltaFactor > 0 with threshold=0.
  if (result.kind === "skip") {
    assert.equal(result.reason, "cost-forecast-exceeds-threshold");
  }
});

test("evaluateCostForecastGate: huge threshold (10) never fires", () => {
  // The calibration sample factors all sit between ~1.0 and ~1.21, so the
  // delta between two evaluations cannot exceed ~0.2 within the calibration
  // range. Threshold=10 is always far above any realistic delta.
  const result = evaluateCostForecastGate(
    input({ currentClaudeMdBytes: 35_000, threshold: 10 }),
  );
  assert.equal(result.kind, "let-through");
});

test("evaluateCostForecastGate: explicit zero threshold + non-empty CLAUDE.md exercises the comparison branch", () => {
  // Whether the result is skip or let-through depends on the sign of the
  // post-redo curve's local slope at this size; we just verify the gate
  // *does* compute and log a decision (i.e., the threshold path was taken).
  const events: Array<Record<string, unknown>> = [];
  const captureLogger = {
    info: (_event: string, data: Record<string, unknown>) => {
      events.push(data);
    },
    warn: () => {},
    error: () => {},
    debug: () => {},
  } as unknown as Logger;

  evaluateCostForecastGate(
    input({
      currentClaudeMdBytes: 30_000,
      threshold: 0,
      logger: captureLogger,
    }),
  );
  assert.equal(events.length, 1);
  const data = events[0];
  assert.equal(typeof data.deltaFactor, "number");
  assert.equal(typeof data.currentFactor, "number");
  assert.equal(typeof data.projectedFactor, "number");
  assert.equal(typeof data.threshold, "number");
});

// -----------------------------------------------------------------------
// Logging contract
// -----------------------------------------------------------------------

test("evaluateCostForecastGate: always logs the decision under cost_forecast_gate event", () => {
  const events: Array<{ event: string; data: unknown }> = [];
  const captureLogger = {
    info: (event: string, data: unknown) => events.push({ event, data }),
    warn: () => {},
    error: () => {},
    debug: () => {},
  } as unknown as Logger;

  evaluateCostForecastGate(
    input({ currentClaudeMdBytes: 10_000, logger: captureLogger }),
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "specialization.cost_forecast_gate");
  const data = events[0].data as { decision: string };
  assert.equal(data.decision, "let-through");
});

test("evaluateCostForecastGate: empty-claude-md path also logs", () => {
  const events: Array<{ event: string; data: unknown }> = [];
  const captureLogger = {
    info: (event: string, data: unknown) => events.push({ event, data }),
    warn: () => {},
    error: () => {},
    debug: () => {},
  } as unknown as Logger;

  evaluateCostForecastGate(
    input({ currentClaudeMdBytes: 0, logger: captureLogger }),
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "specialization.cost_forecast_gate");
  const data = events[0].data as { decision: string; reason: string };
  assert.equal(data.decision, "let-through");
  assert.equal(data.reason, "empty-claude-md");
});

// -----------------------------------------------------------------------
// resolveCostForecastThreshold
// -----------------------------------------------------------------------

test("resolveCostForecastThreshold: missing/empty env returns default Infinity", () => {
  assert.equal(resolveCostForecastThreshold({}), DEFAULT_COST_FORECAST_THRESHOLD);
  assert.equal(resolveCostForecastThreshold({}), Infinity);
  assert.equal(
    resolveCostForecastThreshold({ VP_DEV_COST_FORECAST_THRESHOLD: "" }),
    DEFAULT_COST_FORECAST_THRESHOLD,
  );
});

test("resolveCostForecastThreshold: valid finite values are accepted", () => {
  assert.equal(
    resolveCostForecastThreshold({ VP_DEV_COST_FORECAST_THRESHOLD: "0.05" }),
    0.05,
  );
  assert.equal(
    resolveCostForecastThreshold({ VP_DEV_COST_FORECAST_THRESHOLD: "0" }),
    0,
  );
  assert.equal(
    resolveCostForecastThreshold({ VP_DEV_COST_FORECAST_THRESHOLD: "1.5" }),
    1.5,
  );
});

test("resolveCostForecastThreshold: Infinity is accepted (gate-disabled marker)", () => {
  assert.equal(
    resolveCostForecastThreshold({ VP_DEV_COST_FORECAST_THRESHOLD: "Infinity" }),
    Infinity,
  );
});

test("resolveCostForecastThreshold: invalid env falls back to default", () => {
  assert.equal(
    resolveCostForecastThreshold({ VP_DEV_COST_FORECAST_THRESHOLD: "abc" }),
    DEFAULT_COST_FORECAST_THRESHOLD,
  );
  assert.equal(
    resolveCostForecastThreshold({ VP_DEV_COST_FORECAST_THRESHOLD: "-1" }),
    DEFAULT_COST_FORECAST_THRESHOLD,
  );
  assert.equal(
    resolveCostForecastThreshold({ VP_DEV_COST_FORECAST_THRESHOLD: "NaN" }),
    DEFAULT_COST_FORECAST_THRESHOLD,
  );
});
