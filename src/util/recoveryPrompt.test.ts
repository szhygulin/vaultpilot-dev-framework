import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildEnvelopeOnlyPrompt,
  buildRecoveryPrompt,
} from "../agent/codingAgent.js";
import { extractEnvelope } from "../agent/parseResult.js";

// Recovery pass 2a (issue #89): the prompt instructs the model to emit
// ONLY a bare JSON envelope, with no tool calls and no preamble. The
// envelope shipped in the prompt body must itself be a valid envelope so
// agents that copy it verbatim get a parseable result.
test("buildEnvelopeOnlyPrompt: contains a parseable fallback envelope", () => {
  const prompt = buildEnvelopeOnlyPrompt();
  const parsed = extractEnvelope(prompt);
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.envelope?.decision, "error");
  assert.match(parsed.envelope?.reason ?? "", /turn ceiling/i);
  assert.deepEqual(parsed.envelope?.memoryUpdate.addTags, []);
});

test("buildEnvelopeOnlyPrompt: forbids tool use", () => {
  const prompt = buildEnvelopeOnlyPrompt();
  // The hard guarantee against drift comes from `tools: []` at the SDK
  // level, but the prompt itself must not invite tool use either —
  // otherwise even with tools disabled the model wastes its single turn
  // apologizing for being unable to comply.
  assert.match(prompt, /no tools/i);
  assert.doesNotMatch(prompt, /\bgit status\b/i);
  assert.doesNotMatch(prompt, /\bnpm (run|test)\b/i);
  assert.doesNotMatch(prompt, /\bgh (issue|pr) (create|view)\b/i);
});

test("buildRecoveryPrompt: pass 2b retains the commit + push + envelope flow", () => {
  const prompt = buildRecoveryPrompt({ branchName: "vp-dev/agent-x/issue-1" });
  // Verification pass keeps the original work-salvage steps; only the
  // envelope-first ordering moved to pass 2a.
  assert.match(prompt, /git status/);
  assert.match(prompt, /git push -u origin vp-dev\/agent-x\/issue-1/);
  assert.match(prompt, /JSON envelope/);
  // Pass 2b explicitly notes that pass 2a already recorded a fallback so
  // a budget-truncated 2b doesn't silently degrade the result.
  assert.match(prompt, /Pass 1 already recorded/i);
});

test("buildRecoveryPrompt: fallback pushback envelope embedded in prompt is parseable", () => {
  const prompt = buildRecoveryPrompt({ branchName: "vp-dev/agent-x/issue-1" });
  const parsed = extractEnvelope(prompt);
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.envelope?.decision, "pushback");
  assert.match(parsed.envelope?.reason ?? "", /no recoverable artifact/i);
});
