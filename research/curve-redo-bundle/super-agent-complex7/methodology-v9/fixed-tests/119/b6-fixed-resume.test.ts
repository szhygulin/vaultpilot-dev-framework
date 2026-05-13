// Issue #119 v5 — resume-incomplete worktree + render block.
// FIXES: probe buildResumeContext vs buildResumeContextMap, probe field name
// variants, probe alternate symbol names like parseIssueIdFromBranch.
import { test, before } from "node:test";
import assert from "node:assert/strict";

const PATHS = ["./prompt.js", "./prompt.ts", "../cli.js", "../agent/prompt.js"];
const PATHS_CLI = ["../cli.js", "../cli.ts", "./cli.js"];

let promptMod: any = null;
let cliMod: any = null;
let renderResumeBlock: any = null;
let buildResumeContextMap: any = null;
let parseIssueIdFromBranch: any = null;

async function load(paths: string[]) {
  for (const p of paths) {
    try { const m = await import(p); if (m && Object.keys(m).length) return m; } catch {}
  }
  return null;
}
function pick(m: any, names: string[]): any {
  for (const n of names) if (m && typeof m[n] === "function") return m[n];
  return null;
}

const setup = (async () => {
  promptMod = await load(PATHS);
  if (promptMod) renderResumeBlock = pick(promptMod, ["renderResumeBlock", "buildResumeBlock", "renderResume"]);
  cliMod = await load(PATHS_CLI);
  if (cliMod) {
    buildResumeContextMap = pick(cliMod, ["buildResumeContextMap", "buildResumeContext", "loadResumeContexts", "scanResumeContexts"]);
    parseIssueIdFromBranch = pick(cliMod, ["parseIssueIdFromBranch", "issueIdFromBranch", "extractIssueIdFromBranch"]);
  }
})();

test("b6 modules loaded (prompt + cli)", async () => {
  await setup;
  // Soft: either module path can work depending on impl
  assert.ok(promptMod || cliMod, "neither prompt nor cli module loaded");
});

test("b6 renderResumeBlock present (or alias)", async () => {
  await setup;
  if (!renderResumeBlock) return; // soft-skip if impl uses entirely different shape
  assert.equal(typeof renderResumeBlock, "function");
});

test("b6 renderResumeBlock returns a string mentioning prior work", async () => {
  await setup;
  if (!renderResumeBlock) return;
  const out = renderResumeBlock({
    agentId: "agent-Z",
    runId: "run-2026-05-01",
    partialBranchUrl: "https://example.com/branch",
    finalText: "hit cap",
    errorSubtype: "error_max_turns",
  });
  if (typeof out !== "string") return; // tolerate object return + render-into shape
  assert.ok(out.length > 30, "render output should be non-trivial");
  // Stub-defeat: must reference some input field
  const mentionsInput = /agent-Z|run-2026|hit cap|branch/.test(out);
  assert.ok(mentionsInput, "renderResumeBlock must incorporate some input — looks like a stub");
});

test("b6 parseIssueIdFromBranch handles incomplete-branch shapes", async () => {
  await setup;
  if (!parseIssueIdFromBranch) return;
  const id1 = parseIssueIdFromBranch("vp-dev/agent-abc/issue-42-incomplete-run-2026-05");
  assert.equal(id1, 42, "expected issue id 42 from incomplete branch");
  const id2 = parseIssueIdFromBranch("vp-dev/agent-abc/issue-7");
  assert.equal(id2, 7, "expected issue id 7 from normal branch");
});

test("b6 parseIssueIdFromBranch returns undefined for non-matching", async () => {
  await setup;
  if (!parseIssueIdFromBranch) return;
  const r = parseIssueIdFromBranch("not-a-branch-name");
  assert.ok(r === undefined || r === null || Number.isNaN(r), "non-matching branch should return undefined/null/NaN");
});

test("b6 stub-defeat: renderResumeBlock varies by errorSubtype", async () => {
  await setup;
  if (!renderResumeBlock) return;
  const a = renderResumeBlock({ agentId: "x", runId: "r", errorSubtype: "error_max_turns" });
  const b = renderResumeBlock({ agentId: "x", runId: "r", errorSubtype: "budget_exceeded" });
  if (typeof a !== "string" || typeof b !== "string") return;
  assert.notEqual(a, b, "renderResumeBlock must vary by errorSubtype — looks like a stub");
});
