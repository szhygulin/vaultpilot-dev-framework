import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCostTransparencyLine,
  buildFailurePrompt,
  buildPrompt,
  type FailureSummarizerInput,
  type SummarizerInput,
} from "./summarizer.js";
import type { Logger } from "../log/logger.js";
import type { AgentRecord, IssueSummary, ResultEnvelope } from "../types.js";

const stubLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as Logger;

const stubAgent: AgentRecord = {
  agentId: "agent-test",
  name: "Test",
  tags: ["solana", "evm"],
  createdAt: "2026-04-01T00:00:00Z",
  lastActiveAt: "2026-05-06T00:00:00Z",
  issuesHandled: 5,
  implementCount: 2,
  pushbackCount: 2,
  errorCount: 1,
};

const stubIssue: IssueSummary = {
  id: 42,
  title: "Test issue",
  labels: ["bug"],
  state: "open",
};

const stubEnvelope: ResultEnvelope = {
  decision: "implement",
  reason: "Did the work",
  prUrl: "https://example.com/pr/1",
  memoryUpdate: { addTags: ["solana"] },
};

// -----------------------------------------------------------------------
// #179 Phase 1, option F — buildCostTransparencyLine
// -----------------------------------------------------------------------

test("buildCostTransparencyLine: returns empty string when bytes undefined", () => {
  assert.equal(buildCostTransparencyLine(undefined), "");
});

test("buildCostTransparencyLine: returns empty string when bytes is zero", () => {
  assert.equal(buildCostTransparencyLine(0), "");
});

test("buildCostTransparencyLine: returns empty string for negative bytes", () => {
  assert.equal(buildCostTransparencyLine(-100), "");
});

test("buildCostTransparencyLine: emits cost line with KB + degradation factor", () => {
  const line = buildCostTransparencyLine(20 * 1024);
  assert.match(line, /Marginal cost of adding a lesson/);
  assert.match(line, /CLAUDE\.md is currently 20\.0 KB/);
  assert.match(line, /predicted accuracy degradation factor [\d.]+/);
  assert.match(line, /Adding a worst-case lesson grows it to ~/);
  assert.match(line, /Skip if the lesson isn't carrying weight/);
  assert.match(line, /linear-log accuracy fit, #179/);
});

test("buildCostTransparencyLine: predicted-after factor ≥ predicted-now factor (monotonic)", () => {
  // Linear-log slope is positive on the pre-study placeholder samples;
  // adding bytes can only increase the predicted factor (or stay equal in
  // edge cases). Parse the two factors from the rendered line and confirm.
  const line = buildCostTransparencyLine(10 * 1024);
  const factors = [...line.matchAll(/factor [~]?([\d.]+)/g)].map((m) =>
    Number(m[1]),
  );
  assert.equal(factors.length, 2);
  assert.ok(
    factors[1] >= factors[0],
    `expected factor-after ≥ factor-now, got ${factors[1]} < ${factors[0]}`,
  );
});

// -----------------------------------------------------------------------
// buildPrompt / buildFailurePrompt incorporate the cost line when given bytes
// -----------------------------------------------------------------------

test("buildPrompt: omits cost line when currentClaudeMdBytes is undefined", () => {
  const input: SummarizerInput = {
    agent: stubAgent,
    issue: stubIssue,
    envelope: stubEnvelope,
    toolUseTrace: [],
    finalText: "did the work",
    logger: stubLogger,
  };
  const prompt = buildPrompt(input);
  assert.doesNotMatch(prompt, /Marginal cost of adding a lesson/);
});

test("buildPrompt: includes cost line when currentClaudeMdBytes is provided", () => {
  const input: SummarizerInput = {
    agent: stubAgent,
    issue: stubIssue,
    envelope: stubEnvelope,
    toolUseTrace: [],
    finalText: "did the work",
    logger: stubLogger,
    currentClaudeMdBytes: 25_000,
  };
  const prompt = buildPrompt(input);
  assert.match(prompt, /Marginal cost of adding a lesson/);
  assert.match(prompt, /linear-log accuracy fit, #179/);
});

test("buildFailurePrompt: includes cost line when currentClaudeMdBytes is provided", () => {
  const input: FailureSummarizerInput = {
    agent: stubAgent,
    issue: stubIssue,
    envelope: { ...stubEnvelope, decision: "error" },
    errorReason: "max turns",
    toolUseTrace: [],
    finalText: "ran out of turns",
    logger: stubLogger,
    currentClaudeMdBytes: 30_000,
  };
  const prompt = buildFailurePrompt(input);
  assert.match(prompt, /Marginal cost of adding a lesson/);
});

test("buildFailurePrompt: omits cost line when currentClaudeMdBytes is undefined", () => {
  const input: FailureSummarizerInput = {
    agent: stubAgent,
    issue: stubIssue,
    envelope: { ...stubEnvelope, decision: "error" },
    errorReason: "max turns",
    toolUseTrace: [],
    finalText: "ran out of turns",
    logger: stubLogger,
  };
  const prompt = buildFailurePrompt(input);
  assert.doesNotMatch(prompt, /Marginal cost of adding a lesson/);
});
