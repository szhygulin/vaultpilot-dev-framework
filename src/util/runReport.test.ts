import { test } from "node:test";
import assert from "node:assert/strict";
import { newRunState } from "../state/runState.js";
import type { IssueStatus, RunState } from "../types.js";
import { formatRunReport } from "./runReport.js";

// Issue #136: the end-of-run report block printed inline by `vp-dev run` /
// `vp-dev run --resume`. Format stability matters because external tooling
// is expected to find the block via the bounded `=========` separators and
// the terminal sentinel via `^run\.completed `.

function makeStateWithStatuses(statuses: IssueStatus[]): RunState {
  const ids = statuses.map((_, i) => i + 1);
  const state = newRunState({
    runId: "run-2026-05-05T16-33-14-458Z",
    targetRepo: "x/y",
    issueRange: { kind: "csv", ids },
    parallelism: 1,
    issueIds: ids,
    dryRun: false,
  });
  for (let i = 0; i < statuses.length; i++) {
    state.issues[String(ids[i])].status = statuses[i];
  }
  // Pin a deterministic startedAt / lastTickAt so duration formatting is
  // stable across CI clocks.
  state.startedAt = "2026-05-05T16:33:14.458Z";
  state.lastTickAt = "2026-05-05T16:33:17.549Z";
  return state;
}

test("formatRunReport: text variant wraps formatStatusText in =========-bounded block", () => {
  const state = makeStateWithStatuses(["done"]);
  const out = formatRunReport({
    runId: "run-2026-05-05T16-33-14-458Z",
    state,
    totalCostUsd: 1.42,
    durationMs: 3091,
  });

  const lines = out.split("\n");
  // Leading blank, then separator, header, separator, blank, then the body.
  assert.equal(lines[0], "");
  assert.equal(lines[1], "=========");
  assert.equal(lines[2], "Run complete: run-2026-05-05T16-33-14-458Z");
  assert.equal(lines[3], "=========");
  assert.equal(lines[4], "");
  // Body must start with the standard `Run <id> on <repo>` header from
  // `formatStatusText` so existing operator muscle memory + tooling
  // scrapers recognize the same shape.
  assert.equal(lines[5], "Run run-2026-05-05T16-33-14-458Z on x/y");
});

test("formatRunReport: text variant ends with the run.completed sentinel as the final non-empty line", () => {
  const state = makeStateWithStatuses(["done", "failed"]);
  const out = formatRunReport({
    runId: "run-2026-05-05T16-33-14-458Z",
    state,
    totalCostUsd: 0.5,
    durationMs: 3091,
  });

  // Last non-empty line must start with `run.completed ` so watchers
  // anchored on `^run\.completed ` (issue #128) keep working.
  const nonEmpty = out.split("\n").filter((l) => l.length > 0);
  const final = nonEmpty[nonEmpty.length - 1];
  assert.match(final, /^run\.completed runId=run-2026-05-05T16-33-14-458Z status=partial/);
  assert.match(final, /total=2 done=1 failed=1/);
});

test("formatRunReport: JSON variant emits ---FINAL--- marker + StatusJson + trailing sentinel", () => {
  const state = makeStateWithStatuses(["done"]);
  const out = formatRunReport({
    runId: "run-2026-05-05T16-33-14-458Z",
    state,
    totalCostUsd: 0,
    durationMs: 0,
    json: true,
  });

  assert.match(out, /\n---FINAL---\n/);
  // JSON body must include the runId so consumers can confirm they have
  // the right report.
  assert.match(out, /"runId": "run-2026-05-05T16-33-14-458Z"/);
  // Sentinel still trails — pulled out of the very last line.
  const nonEmpty = out.split("\n").filter((l) => l.length > 0);
  const final = nonEmpty[nonEmpty.length - 1];
  assert.match(final, /^run\.completed runId=run-2026-05-05T16-33-14-458Z/);
});

test("formatRunReport: agentNames threads through to per-issue rendering", () => {
  const state = makeStateWithStatuses(["done"]);
  state.issues["1"].agentId = "agent-92ff";
  state.agents.push({ agentId: "agent-92ff", status: "idle" });

  const out = formatRunReport({
    runId: "run-2026-05-05T16-33-14-458Z",
    state,
    totalCostUsd: 0,
    durationMs: 0,
    agentNames: new Map([["agent-92ff", "Alonzo"]]),
  });

  // The display name must appear in the rendered text — confirms
  // `agentNames` is forwarded into `formatStatusText`.
  assert.match(out, /Alonzo \(agent-92ff\)/);
});

test("formatRunReport: text variant for incomplete (in-flight) state surfaces incomplete classification", () => {
  const state = makeStateWithStatuses(["in-flight", "done"]);
  const out = formatRunReport({
    runId: "run-2026-05-05T16-33-14-458Z",
    state,
    totalCostUsd: 0,
    durationMs: 0,
  });

  assert.match(out, /^run\.completed .*status=incomplete /m);
});
