import { test } from "node:test";
import assert from "node:assert/strict";
import { newRunState } from "../state/runState.js";
import type { IssueStatus, RunState } from "../types.js";
import {
  classifyRunStatus,
  countRunStatuses,
  formatRunCompletedSentinel,
} from "./runCompletedSentinel.js";

// Issue #128: the terminal sentinel is what lets external `tail -F` watchers
// (Claude Code Monitors, shell scripts) detect "run is over" cleanly. Format
// stability matters — watchers anchor on the leading literal `run.completed`
// and treat the line as the signal to exit.

function makeStateWithStatuses(statuses: IssueStatus[]): RunState {
  const ids = statuses.map((_, i) => i + 1);
  const state = newRunState({
    runId: "run-2026-05-05T15-08-13-725Z",
    targetRepo: "x/y",
    issueRange: { kind: "csv", ids },
    parallelism: 1,
    issueIds: ids,
    dryRun: false,
  });
  for (let i = 0; i < statuses.length; i++) {
    state.issues[String(ids[i])].status = statuses[i];
  }
  return state;
}

test("countRunStatuses: tallies each terminal+non-terminal bucket", () => {
  const state = makeStateWithStatuses([
    "done",
    "done",
    "failed",
    "aborted-budget",
    "pending",
    "in-flight",
  ]);
  const c = countRunStatuses(state);
  assert.deepEqual(c, {
    total: 6,
    done: 2,
    failed: 1,
    abortedBudget: 1,
    pending: 1,
    inFlight: 1,
  });
});

test("classifyRunStatus: all done → done", () => {
  const state = makeStateWithStatuses(["done", "done", "done"]);
  assert.equal(classifyRunStatus(state), "done");
});

test("classifyRunStatus: all failed → failed", () => {
  const state = makeStateWithStatuses(["failed", "failed"]);
  assert.equal(classifyRunStatus(state), "failed");
});

test("classifyRunStatus: terminal mix of done + failed → partial", () => {
  const state = makeStateWithStatuses(["done", "failed", "done"]);
  assert.equal(classifyRunStatus(state), "partial");
});

test("classifyRunStatus: any aborted-budget present → aborted-budget", () => {
  // Even mixed with done + failed — the operator-policy halt is the
  // dominant signal for post-run audits (#86).
  const state = makeStateWithStatuses([
    "done",
    "failed",
    "aborted-budget",
    "aborted-budget",
  ]);
  assert.equal(classifyRunStatus(state), "aborted-budget");
});

test("classifyRunStatus: any pending → incomplete", () => {
  // maxTicks reached before isRunComplete fired, OR orchestrator threw
  // mid-tick. Either way, watchers + audits need the gap surfaced
  // explicitly rather than rolled into "failed."
  const state = makeStateWithStatuses(["done", "done", "pending"]);
  assert.equal(classifyRunStatus(state), "incomplete");
});

test("classifyRunStatus: any in-flight → incomplete", () => {
  const state = makeStateWithStatuses(["done", "in-flight"]);
  assert.equal(classifyRunStatus(state), "incomplete");
});

test("classifyRunStatus: incomplete takes precedence over aborted-budget", () => {
  // If a budget abort is in flight but issues are still pending the run
  // hasn't finished winding down — the watcher still needs an
  // "incomplete" exit, not a premature "aborted-budget" claim.
  const state = makeStateWithStatuses(["aborted-budget", "pending"]);
  assert.equal(classifyRunStatus(state), "incomplete");
});

test("classifyRunStatus: empty issue set defaults to done", () => {
  // cmdRun rejects empty dispatch sets pre-launch, but the function must
  // remain total so a stray edge case can't crash sentinel emission.
  const state = makeStateWithStatuses([]);
  assert.equal(classifyRunStatus(state), "done");
});

test("formatRunCompletedSentinel: shape matches the watcher's anchored regex", () => {
  const state = makeStateWithStatuses(["done", "done", "done", "done"]);
  const line = formatRunCompletedSentinel({
    runId: "run-2026-05-05T15-08-13-725Z",
    state,
    totalCostUsd: 2.34,
    durationMs: 575000,
  });
  // Must end with a single trailing newline so callers can stream-write
  // without manual concat.
  assert.ok(line.endsWith("\n"));
  // Anchored prefix is what the example `awk` filter in #128 keys on:
  //   /^run\.completed /{print; exit}
  assert.match(line, /^run\.completed runId=run-2026-05-05T15-08-13-725Z /);
  assert.match(line, /\bstatus=done\b/);
  assert.match(line, /\btotal=4\b/);
  assert.match(line, /\bdone=4\b/);
  assert.match(line, /\bfailed=0\b/);
  assert.match(line, /\baborted-budget=0\b/);
  assert.match(line, /\bdurationMs=575000\b/);
  assert.match(line, /\btotalCostUsd=2\.3400\b/);
});

test("formatRunCompletedSentinel: emits status=aborted-budget when any issue was aborted", () => {
  const state = makeStateWithStatuses(["done", "aborted-budget", "aborted-budget"]);
  const line = formatRunCompletedSentinel({
    runId: "run-X",
    state,
    totalCostUsd: 0.5,
    durationMs: 12000,
  });
  assert.match(line, /\bstatus=aborted-budget\b/);
  assert.match(line, /\bdone=1\b/);
  assert.match(line, /\baborted-budget=2\b/);
});

test("formatRunCompletedSentinel: emits status=incomplete when issues remain non-terminal", () => {
  // The maxTicks-reached path (or thrown-mid-tick path) — sentinel still
  // fires from the finally block so external watchers see exactly one
  // terminal line.
  const state = makeStateWithStatuses(["done", "in-flight", "pending"]);
  const line = formatRunCompletedSentinel({
    runId: "run-X",
    state,
    totalCostUsd: 0,
    durationMs: 1000,
  });
  assert.match(line, /\bstatus=incomplete\b/);
});

test("formatRunCompletedSentinel: dry-run path emits the same shape", () => {
  // Dry-run flows through `runOrchestrator` exactly like a real run; the
  // sentinel must fire uniformly so scripted dry-run probes (e.g. in CI)
  // can rely on the same exit signal.
  const state = makeStateWithStatuses(["done", "done"]);
  state.dryRun = true;
  const line = formatRunCompletedSentinel({
    runId: "run-dry",
    state,
    totalCostUsd: 0,
    durationMs: 50,
  });
  assert.match(line, /^run\.completed runId=run-dry /);
  assert.match(line, /\bstatus=done\b/);
  // dry-run does not get its own status — `dryRun` is a property of the
  // run-state file, surfaced separately by `vp-dev status` / log analysis.
  assert.doesNotMatch(line, /dryRun/);
});

test("formatRunCompletedSentinel: cost is fixed at 4 decimals and clamps non-finite to zero", () => {
  const state = makeStateWithStatuses(["done"]);
  const line1 = formatRunCompletedSentinel({
    runId: "r",
    state,
    totalCostUsd: 0,
    durationMs: 1,
  });
  assert.match(line1, /\btotalCostUsd=0\.0000\b/);

  const line2 = formatRunCompletedSentinel({
    runId: "r",
    state,
    totalCostUsd: Number.NaN,
    durationMs: 1,
  });
  assert.match(line2, /\btotalCostUsd=0\.0000\b/);

  const line3 = formatRunCompletedSentinel({
    runId: "r",
    state,
    totalCostUsd: 1.23456789,
    durationMs: 1,
  });
  assert.match(line3, /\btotalCostUsd=1\.2346\b/);
});

test("formatRunCompletedSentinel: durationMs floors fractional values", () => {
  // `Date.now()` returns integers but defensive truncation keeps the line
  // shape stable if a future caller passes a `performance.now()` delta.
  const state = makeStateWithStatuses(["done"]);
  const line = formatRunCompletedSentinel({
    runId: "r",
    state,
    totalCostUsd: 0,
    durationMs: 1234.9,
  });
  assert.match(line, /\bdurationMs=1234\b/);
});

test("formatRunCompletedSentinel: durationMs negative inputs clamp to zero", () => {
  const state = makeStateWithStatuses(["done"]);
  const line = formatRunCompletedSentinel({
    runId: "r",
    state,
    totalCostUsd: 0,
    durationMs: -5,
  });
  assert.match(line, /\bdurationMs=0\b/);
});

test("formatRunCompletedSentinel: single-line — no embedded newlines before the trailing one", () => {
  const state = makeStateWithStatuses(["done", "failed"]);
  const line = formatRunCompletedSentinel({
    runId: "run-X",
    state,
    totalCostUsd: 0,
    durationMs: 0,
  });
  // Strip the trailing newline; what remains must contain no further
  // newlines so a watcher's per-line consumer treats it as one record.
  const body = line.replace(/\n$/, "");
  assert.equal(body.includes("\n"), false);
  // `partial` because terminal mix of done + failed.
  assert.match(line, /\bstatus=partial\b/);
});
