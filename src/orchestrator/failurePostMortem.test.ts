import { test } from "node:test";
import assert from "node:assert/strict";
import {
  composeFailurePostMortem,
  detectPendingPostMortem,
  detectUniformHarnessFailure,
  POST_MORTEM_SENTINEL,
  type PendingPostMortem,
} from "./failurePostMortem.js";
import type { IssueComment } from "../github/gh.js";

// ---- composeFailurePostMortem -------------------------------------------

test("composeFailurePostMortem: header carries the canonical sentinel + run/agent ids", () => {
  const body = composeFailurePostMortem({
    runId: "run-2026-05-05T10-00-00",
    agentId: "agent-72c6",
    errorSubtype: "error_max_turns",
    costUsd: 4.51,
    durationMs: 7 * 60_000,
    partialBranchUrl: "https://github.com/x/y/tree/vp-dev/agent-72c6/issue-42-incomplete-run-2026-05-05T10-00-00",
  });
  // First line MUST start with the canonical sentinel — triage relies on
  // the `^## ` anchor for detection.
  const firstLine = body.split("\n")[0];
  assert.ok(POST_MORTEM_SENTINEL.test(firstLine), `sentinel should match: ${firstLine}`);
  assert.ok(firstLine.includes("run-2026-05-05T10-00-00"));
  assert.ok(firstLine.includes("agent-72c6"));
  assert.ok(body.includes("`error_max_turns`"));
  assert.ok(body.includes("$4.51"));
  assert.ok(body.includes("7.0 min"));
  assert.ok(body.includes("Partial branch"));
});

test("composeFailurePostMortem: missing partial branch and cost is rendered without errors", () => {
  const body = composeFailurePostMortem({
    runId: "run-x",
    agentId: "agent-ab",
    errorSubtype: "error_during_execution",
  });
  assert.ok(POST_MORTEM_SENTINEL.test(body));
  assert.ok(!body.includes("Partial branch"));
  assert.ok(!body.includes("Cost burned"));
  assert.ok(body.includes("error_during_execution"));
  // Likely-cause heuristic still rendered.
  assert.ok(/Likely cause/i.test(body));
});

test("composeFailurePostMortem: errorReason fallback when errorSubtype absent", () => {
  const body = composeFailurePostMortem({
    runId: "run-x",
    agentId: "agent-ab",
    errorReason: "child stream closed",
  });
  assert.ok(body.includes("`child stream closed`"));
});

test("composeFailurePostMortem: 'unknown' fallback when neither subtype nor reason given", () => {
  const body = composeFailurePostMortem({ runId: "run-x", agentId: "agent-ab" });
  assert.ok(body.includes("`unknown`"));
});

// ---- detectPendingPostMortem --------------------------------------------

function comment(body: string, createdAt = "2026-05-05T10:00:00Z", author = "vp-dev"): IssueComment {
  return { author, body, createdAt };
}

test("detectPendingPostMortem: returns pending=false when no post-mortem comment exists", () => {
  const result = detectPendingPostMortem([
    comment("Looks good!", "2026-05-04T10:00:00Z", "alice"),
    comment("Updated spec.", "2026-05-04T11:00:00Z", "bob"),
  ]);
  assert.equal(result.pending, false);
});

test("detectPendingPostMortem: detects most-recent post-mortem with no follow-up", () => {
  const result = detectPendingPostMortem([
    comment("Initial scope", "2026-05-04T10:00:00Z", "alice"),
    comment(
      "## vp-dev failure post-mortem (run-2026-05-05, agent-72c6)\n\n- error: error_max_turns",
      "2026-05-05T10:00:00Z",
      "vp-dev",
    ),
  ]);
  assert.equal(result.pending, true);
  assert.ok(result.reason?.includes("run-2026-05-05"));
});

test("detectPendingPostMortem: resolution keyword in later comment flips back to ready", () => {
  const result = detectPendingPostMortem([
    comment(
      "## vp-dev failure post-mortem (run-A, agent-1)\n\n- error: error_max_turns",
      "2026-05-05T10:00:00Z",
      "vp-dev",
    ),
    comment("retry — split into Phase 1/2", "2026-05-05T11:00:00Z", "alice"),
  ]);
  assert.equal(result.pending, false);
});

test("detectPendingPostMortem: case-insensitive sentinel match", () => {
  const result = detectPendingPostMortem([
    comment(
      "## VP-DEV FAILURE POST-MORTEM (run-X, agent-1)\n\nfailed",
      "2026-05-05T10:00:00Z",
    ),
  ]);
  assert.equal(result.pending, true);
});

test("detectPendingPostMortem: anchored sentinel — quoted text inside another comment is not a false positive", () => {
  // A reviewer quoting the sentinel inline (NOT at the start of a line)
  // must not trip the gate. The sentinel regex anchors to `^## `.
  const result = detectPendingPostMortem([
    comment(
      "I saw the bot write '## vp-dev failure post-mortem' but that was last week.",
      "2026-05-05T10:00:00Z",
      "alice",
    ),
  ]);
  assert.equal(result.pending, false);
});

test("detectPendingPostMortem: sentinel at the start of any line counts (multi-paragraph comment)", () => {
  // The sentinel matches `^## ` with the `m` flag so a post-mortem
  // comment that has a leading preamble paragraph still detects.
  const result = detectPendingPostMortem([
    comment(
      "Heads up:\n\n## vp-dev failure post-mortem (run-X, agent-1)\n\n- error",
      "2026-05-05T10:00:00Z",
    ),
  ]);
  assert.equal(result.pending, true);
});

test("detectPendingPostMortem: a SECOND post-mortem after the first does NOT resolve the gate", () => {
  // Two failed runs in a row — second post-mortem cannot count as a
  // resolution signal because it's vp-dev's own failure record.
  const result = detectPendingPostMortem([
    comment(
      "## vp-dev failure post-mortem (run-A, agent-1)\n\nfailed",
      "2026-05-05T10:00:00Z",
    ),
    comment(
      "## vp-dev failure post-mortem (run-B, agent-2)\n\nfailed again",
      "2026-05-06T10:00:00Z",
    ),
  ]);
  assert.equal(result.pending, true);
  // Reason cites the MOST RECENT post-mortem (run-B), not the first.
  assert.ok(result.reason?.includes("run-B"));
});

test("detectPendingPostMortem: 'fix landed' resolution keyword (multi-word) is recognized", () => {
  const result = detectPendingPostMortem([
    comment(
      "## vp-dev failure post-mortem (run-A, agent-1)\n\nfailed",
      "2026-05-05T10:00:00Z",
    ),
    comment("fix landed in #87 — try again", "2026-05-05T11:00:00Z", "alice"),
  ]);
  assert.equal(result.pending, false);
});

test("detectPendingPostMortem: 'resume' keyword (issue #118) lifts the gate", () => {
  // Phase 1 of #118 added `resume` as a generic unblock signal so a human
  // who intends to re-attempt with --resume-incomplete on the next run can
  // flip triage back to ready without having to remember the older
  // `retry`/`unblock` vocabulary.
  const result = detectPendingPostMortem([
    comment(
      "## vp-dev failure post-mortem (run-A, agent-1)\n\nfailed",
      "2026-05-05T10:00:00Z",
    ),
    comment("resume on next dispatch — partial branch looks salvageable", "2026-05-05T11:00:00Z", "alice"),
  ]);
  assert.equal(result.pending, false);
});

test("detectPendingPostMortem: an ambient unrelated comment does NOT lift the gate", () => {
  // A human comment that does NOT contain a resolution keyword leaves the
  // gate in place. Only explicit signals lift it.
  const result = detectPendingPostMortem([
    comment(
      "## vp-dev failure post-mortem (run-A, agent-1)\n\nfailed",
      "2026-05-05T10:00:00Z",
    ),
    comment("yeah this is annoying, will look later", "2026-05-05T11:00:00Z", "alice"),
  ]);
  assert.equal(result.pending, true);
});

// ---- detectUniformHarnessFailure (issue #250) ---------------------------

function pending(
  issueId: number,
  input: Partial<PendingPostMortem["input"]> & { errorSubtype?: string } = {},
): PendingPostMortem {
  return {
    issueId,
    input: {
      runId: "run-2026-05-08T10-01-12-536Z",
      agentId: `agent-${issueId.toString(16).padStart(4, "0")}`,
      errorSubtype: input.errorSubtype,
      errorReason: input.errorReason,
      costUsd: input.costUsd ?? 0,
      durationMs: input.durationMs ?? 5_000,
      partialBranchUrl: input.partialBranchUrl,
    },
  };
}

test("detectUniformHarnessFailure: empty queue → not suppressed", () => {
  const v = detectUniformHarnessFailure([]);
  assert.equal(v.suppress, false);
  assert.equal(v.count, 0);
});

test("detectUniformHarnessFailure: single failure → not suppressed (no fanout exists)", () => {
  // The whole point of the suppression is to silence N near-identical
  // comments across N issues. With one issue there's no fanout — the
  // operator wants the per-issue gate even for a $0/short-duration crash.
  const v = detectUniformHarnessFailure([
    pending(101, { errorSubtype: "error_during_execution" }),
  ]);
  assert.equal(v.suppress, false);
  assert.equal(v.count, 1);
});

test("detectUniformHarnessFailure: uniform harness pattern (SDK init crash) → suppressed", () => {
  // Mirrors run-2026-05-08T10-01-12-536Z: 11 SDK-init failures, $0 cost,
  // sub-30s durations, all sharing the same errorSubtype. The whole
  // fanout collapses into one run-level diagnostic.
  const v = detectUniformHarnessFailure([
    pending(101, { errorSubtype: "error_during_execution", costUsd: 0, durationMs: 8_000 }),
    pending(102, { errorSubtype: "error_during_execution", costUsd: 0, durationMs: 7_500 }),
    pending(103, { errorSubtype: "error_during_execution", costUsd: 0, durationMs: 9_200 }),
  ]);
  assert.equal(v.suppress, true);
  assert.equal(v.count, 3);
  assert.equal(v.sharedSubtype, "error_during_execution");
  assert.ok(v.reason && /3 dispatched issues/.test(v.reason));
  assert.ok(v.reason && /error_during_execution/.test(v.reason));
});

test("detectUniformHarnessFailure: mixed errorSubtypes → not suppressed (issue-side, distinct causes)", () => {
  // Two separate failures with separate root causes → operators want
  // both per-issue post-mortems so triage flags each correctly.
  const v = detectUniformHarnessFailure([
    pending(201, { errorSubtype: "error_during_execution", costUsd: 0, durationMs: 5_000 }),
    pending(202, { errorSubtype: "error_max_turns", costUsd: 0, durationMs: 5_000 }),
  ]);
  assert.equal(v.suppress, false);
});

test("detectUniformHarnessFailure: any pending exceeds cost threshold → not suppressed", () => {
  // One agent reached issue context (cost > threshold) — that's
  // issue-side work that crashed late, the per-issue gate IS the right
  // surface even if the other agents died at SDK-init.
  const v = detectUniformHarnessFailure([
    pending(301, { errorSubtype: "error_during_execution", costUsd: 0, durationMs: 5_000 }),
    pending(302, { errorSubtype: "error_during_execution", costUsd: 0.5, durationMs: 5_000 }),
  ]);
  assert.equal(v.suppress, false);
});

test("detectUniformHarnessFailure: any pending exceeds duration threshold → not suppressed", () => {
  // An agent that ran for 60s likely reached issue context even with
  // cost not reported — keep the per-issue gate.
  const v = detectUniformHarnessFailure([
    pending(401, { errorSubtype: "error_during_execution", costUsd: 0, durationMs: 5_000 }),
    pending(402, { errorSubtype: "error_during_execution", costUsd: 0, durationMs: 60_000 }),
  ]);
  assert.equal(v.suppress, false);
});

test("detectUniformHarnessFailure: missing errorSubtype on first pending → not suppressed", () => {
  // No machine-readable cause to share — fall back to per-issue posts so
  // a human reading each comment can read the free-form reason.
  const v = detectUniformHarnessFailure([
    pending(501, { errorReason: "no envelope emitted", costUsd: 0, durationMs: 5_000 }),
    pending(502, { errorReason: "no envelope emitted", costUsd: 0, durationMs: 5_000 }),
  ]);
  assert.equal(v.suppress, false);
});

test("detectUniformHarnessFailure: error_max_turns on a long-running agent → not suppressed", () => {
  // Classic issue-side failure: agent burned cost and turns reading the
  // issue + editing files, then ran out. Per-issue post-mortem IS the
  // value-add here (Pre-dispatch scope-fit check, salvage with
  // --resume-incomplete, etc.). Two such failures don't make them
  // harness-shaped.
  const v = detectUniformHarnessFailure([
    pending(601, { errorSubtype: "error_max_turns", costUsd: 4.51, durationMs: 7 * 60_000 }),
    pending(602, { errorSubtype: "error_max_turns", costUsd: 3.20, durationMs: 6 * 60_000 }),
  ]);
  assert.equal(v.suppress, false);
});
