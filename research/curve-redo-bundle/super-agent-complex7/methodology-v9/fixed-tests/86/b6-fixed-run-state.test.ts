// Issue #86 v5 — cost-ceiling enforcement + aborted-budget terminal state.
// FIXES from v4 audit:
//   - Probe module paths (../state/runState.js, etc.).
//   - Probe function names + field names.
//   - Stub-defeat: aborted issue must be terminal AND not pending AND not in-flight.
import { test, expect, beforeAll } from "node:test";
import assert from "node:assert/strict";

const MODULE_PATHS = [
  "../state/runState.js",
  "../state/runstate.js",
  "../state/run-state.js",
  "../runState.js",
  "../src/state/runState.js",
];

let mod: any = null;
let newRunState: any, isRunComplete: any, markAborted: any, pendingIssueIds: any;

async function load() {
  for (const p of MODULE_PATHS) {
    try {
      const m = await import(p);
      if (m && Object.keys(m).length > 0) return m;
    } catch {}
  }
  return null;
}
function pick(m: any, names: string[]): any {
  for (const n of names) if (m && typeof m[n] === "function") return m[n];
  return null;
}

const setup = (async () => {
  mod = await load();
  if (mod) {
    newRunState = pick(mod, ["newRunState", "createRunState", "initRunState", "emptyRunState"]);
    isRunComplete = pick(mod, ["isRunComplete", "runIsComplete", "isComplete", "allDone"]);
    markAborted = pick(mod, ["markAborted", "abortIssue", "setAborted", "markIssueAborted"]);
    pendingIssueIds = pick(mod, ["pendingIssueIds", "getPendingIssues", "pendingIssues", "listPending"]);
  }
})();

// Pull a per-issue entry. Handles { issues: { "1": ... } } shape variants.
function entry(state: any, id: number | string) {
  const k = String(id);
  return state?.issues?.[k] ?? state?.issues?.[id] ?? state?.[k];
}
function isTerminal(entry: any): boolean {
  if (!entry) return false;
  const status = entry.status ?? entry.state ?? entry.phase;
  if (typeof status === "string") {
    return /done|failed|aborted|complete|terminal/i.test(status);
  }
  return entry.done === true || entry.complete === true || entry.terminal === true;
}
function isPending(entry: any): boolean {
  if (!entry) return false;
  const status = entry.status ?? entry.state ?? entry.phase;
  if (typeof status === "string") return /pending|queued|waiting/i.test(status);
  return entry.pending === true;
}

test("b6 module loads with required functions", async () => {
  await setup;
  assert.ok(mod, "implementation module not found");
  assert.ok(typeof newRunState === "function", "newRunState (or alias) not found");
  assert.ok(typeof markAborted === "function", "markAborted (or alias) not found");
  assert.ok(typeof isRunComplete === "function", "isRunComplete (or alias) not found");
});

function callNewState(ids: number[]): any {
  // Probe call shapes: (ids[]) or ({ issueIds: ids[] }) or ({ issues: ids[] })
  const tries = [
    () => newRunState(ids),
    () => newRunState({ issueIds: ids }),
    () => newRunState({ issues: ids }),
    () => newRunState({ issueIds: ids, runId: "test-run" }),
  ];
  for (const fn of tries) {
    try {
      const r = fn();
      if (r && (r.issues || typeof r === "object")) return r;
    } catch {}
  }
  return null;
}

test("b6 newRunState produces an initial state with the given issues", async () => {
  await setup;
  const s = callNewState([1, 2, 3]);
  assert.ok(s, "newRunState returned falsy (tried both array and {issueIds:...} call shapes)");
  const e1 = entry(s, 1);
  assert.ok(e1, "state has no entry for issueId=1");
  assert.ok(!isTerminal(e1), "fresh issue should not be terminal");
});

test("b6 markAborted makes the issue terminal and not pending", async () => {
  await setup;
  let s = callNewState([1, 2, 3]);
  s = markAborted(s, 1) ?? s; // some impls mutate, some return new state
  const e = entry(s, 1);
  assert.ok(e, "after markAborted, entry still exists");
  assert.ok(isTerminal(e), "aborted issue should be terminal");
  assert.ok(!isPending(e), "aborted issue should NOT be pending");
});

test("b6 markAborted+pendingIssueIds — aborted excluded", async () => {
  await setup;
  if (typeof pendingIssueIds !== "function") return; // soft-skip if alias not found
  let s = callNewState([1, 2, 3]);
  s = markAborted(s, 1) ?? s;
  const p = pendingIssueIds(s);
  assert.ok(Array.isArray(p), "pendingIssueIds should return an array");
  assert.ok(!p.includes(1), "aborted issue should not appear in pendingIssueIds");
  assert.ok(p.includes(2) && p.includes(3), "non-aborted issues should still be pending");
});

test("b6 isRunComplete is false while pending issues remain", async () => {
  await setup;
  let s = callNewState([1, 2, 3]);
  s = markAborted(s, 1) ?? s;
  assert.equal(isRunComplete(s), false, "run is not complete while #2,#3 still pending");
});

test("b6 isRunComplete is true once every issue is terminal", async () => {
  await setup;
  let s = callNewState([1, 2]);
  s = markAborted(s, 1) ?? s;
  s = markAborted(s, 2) ?? s;
  assert.equal(isRunComplete(s), true, "run should be complete when all issues aborted");
});

test("b6 stub-defeat: aborted issue must change observable state", async () => {
  await setup;
  let s0 = callNewState([1]);
  let s1 = markAborted(s0, 1) ?? s0;
  const e0 = entry(s0, 1);
  const e1 = entry(s1, 1);
  // The aborted issue's status/state field must differ from the initial
  const status0 = e0?.status ?? e0?.state ?? e0?.phase;
  const status1 = e1?.status ?? e1?.state ?? e1?.phase;
  assert.notEqual(status1, status0, "markAborted must change observable status (stub returns same state)");
});
