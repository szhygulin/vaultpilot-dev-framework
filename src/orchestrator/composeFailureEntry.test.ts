import { test } from "node:test";
import assert from "node:assert/strict";
import { composeFailureEntry } from "./orchestrator.js";

// Issue #87: when an agent run truncates via SDK errorSubtype (e.g.
// error_max_turns), the run-state file must record the cause as the
// primary `error` string and keep the parser-symptom as a secondary
// `parseError` field — not collapse both into the bare parse-error
// message that hides why the agent died.

test("composeFailureEntry: errorSubtype wins over parseError as primary error", () => {
  const entry = composeFailureEntry({
    agentId: "agent-01",
    errorSubtype: "error_max_turns",
    parseError: "No JSON envelope found in final assistant message.",
  });
  assert.equal(entry.status, "failed");
  assert.equal(entry.outcome, "error");
  assert.equal(entry.error, "error_max_turns");
  assert.equal(entry.errorSubtype, "error_max_turns");
  assert.equal(
    entry.parseError,
    "No JSON envelope found in final assistant message.",
  );
});

test("composeFailureEntry: errorSubtype wins over errorReason as primary error", () => {
  const entry = composeFailureEntry({
    agentId: "agent-01",
    errorSubtype: "error_during_execution",
    errorReason: "child stream closed",
  });
  assert.equal(entry.error, "error_during_execution");
  assert.equal(entry.errorSubtype, "error_during_execution");
  assert.equal(entry.parseError, undefined);
});

test("composeFailureEntry: errorReason used when no errorSubtype is present", () => {
  const entry = composeFailureEntry({
    agentId: "agent-01",
    errorReason: "Connection reset",
    parseError: "No JSON envelope found in final assistant message.",
  });
  assert.equal(entry.error, "Connection reset");
  assert.equal(entry.errorSubtype, undefined);
  assert.equal(
    entry.parseError,
    "No JSON envelope found in final assistant message.",
  );
});

test("composeFailureEntry: parseError-only path preserves legacy behavior", () => {
  // Genuine envelope-parser failure with no SDK error reported — the
  // bare parse-error string remains the primary error so the parser
  // bug stays visible and is not silently buried.
  const entry = composeFailureEntry({
    agentId: "agent-01",
    parseError: "JSON parse failed: unterminated string",
  });
  assert.equal(entry.error, "JSON parse failed: unterminated string");
  assert.equal(entry.errorSubtype, undefined);
  assert.equal(entry.parseError, "JSON parse failed: unterminated string");
});

test("composeFailureEntry: branchUrl appended to primary error", () => {
  const entry = composeFailureEntry({
    agentId: "agent-01",
    errorSubtype: "error_max_turns",
    parseError: "No JSON envelope found in final assistant message.",
    branchUrl: "https://github.com/x/y/tree/vp-dev/agent-01/issue-42",
  });
  assert.equal(
    entry.error,
    "error_max_turns | orphan branch: https://github.com/x/y/tree/vp-dev/agent-01/issue-42",
  );
  assert.equal(entry.errorSubtype, "error_max_turns");
  assert.equal(
    entry.parseError,
    "No JSON envelope found in final assistant message.",
  );
});

test("composeFailureEntry: fallback string when nothing is available", () => {
  const entry = composeFailureEntry({ agentId: "agent-01" });
  assert.equal(entry.error, "Unknown agent failure");
  assert.equal(entry.errorSubtype, undefined);
  assert.equal(entry.parseError, undefined);
});

test("composeFailureEntry: errorSubtype-only path omits parseError field", () => {
  // Recovery succeeded enough that envelope parsing worked but pass1 had
  // an errorSubtype that survived. Defensive case — keep the entry tidy
  // and don't inject a bogus parseError field.
  const entry = composeFailureEntry({
    agentId: "agent-01",
    errorSubtype: "error_max_turns",
  });
  assert.equal(entry.error, "error_max_turns");
  assert.equal(entry.errorSubtype, "error_max_turns");
  assert.equal(entry.parseError, undefined);
  assert.equal(
    Object.prototype.hasOwnProperty.call(entry, "parseError"),
    false,
    "parseError should not be present as a key when undefined",
  );
});
