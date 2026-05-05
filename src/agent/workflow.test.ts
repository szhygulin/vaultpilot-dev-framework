import { test } from "node:test";
import assert from "node:assert/strict";
import { renderWorkflow, type WorkflowVars } from "./workflow.js";

const baseVars: WorkflowVars = {
  issueId: 99,
  targetRepo: "owner/repo",
  worktreePath: "/tmp/wt",
  branchName: "vp-dev/agent-aa00/issue-99",
  dryRun: false,
  agentId: "agent-aa00",
  agentName: "Alonzo",
};

// renderWorkflow's PR-body signature instruction must consume `resumeContext`
// (issue #129) so resumed runs preserve attribution to the originating agent.
// Without these tests, a future refactor could silently drop the co-signature
// branch and the regression would only surface on the next salvage run.

test("renderWorkflow: without resumeContext, only the resuming agent's signature is described", () => {
  const out = renderWorkflow(baseVars);
  assert.match(out, /single-line signature `— Alonzo \(agent-aa00\)`/);
  assert.doesNotMatch(out, /co-signature/);
  assert.doesNotMatch(out, /Resumed run/);
});

test("renderWorkflow: with resumeContext, adds a co-signature instruction naming the originating agent (issue #129)", () => {
  const out = renderWorkflow({
    ...baseVars,
    resumeContext: {
      agentId: "agent-92ff",
      agentName: "Floyd",
      runId: "run-2026-05-05T11-30-15-426Z",
    },
  });
  assert.match(out, /Resumed run \(issue #129\)/);
  assert.match(
    out,
    /co-signature line IMMEDIATELY ABOVE yours/,
  );
  assert.match(
    out,
    /— Floyd \(agent-92ff, partial — run-2026-05-05T11-30-15-426Z\)/,
  );
  // The resuming agent's signature is still described.
  assert.match(out, /single-line signature `— Alonzo \(agent-aa00\)`/);
});

test("renderWorkflow: resumeContext without agentName falls back to agentId in the co-signature template", () => {
  const out = renderWorkflow({
    ...baseVars,
    resumeContext: {
      agentId: "agent-92ff",
      runId: "run-X",
    },
  });
  assert.match(out, /— agent-92ff \(agent-92ff, partial — run-X\)/);
});

// renderWorkflow's auto-phase-followup section (issue #141, Phase 1 of #134)
// must render ONLY when `autoPhaseFollowup === true`. Default-off behavior
// is the load-bearing invariant of Phase 1 — Phase 2 wires the CLI flag,
// and until then the production prompt must remain byte-identical to the
// pre-#141 baseline. Tests pin both the off-by-default and the rendered-on
// shapes against future refactors that might silently flip the default.

test("renderWorkflow: autoPhaseFollowup defaults to off — Step N+1 section is absent", () => {
  const out = renderWorkflow(baseVars);
  assert.doesNotMatch(out, /Step N\+1/);
  assert.doesNotMatch(out, /Auto-file next phase/);
  assert.doesNotMatch(out, /nextPhaseIssueUrl/);
});

test("renderWorkflow: autoPhaseFollowup === false — Step N+1 section is absent (explicit)", () => {
  const out = renderWorkflow({ ...baseVars, autoPhaseFollowup: false });
  assert.doesNotMatch(out, /Step N\+1/);
  assert.doesNotMatch(out, /Auto-file next phase/);
  assert.doesNotMatch(out, /nextPhaseIssueUrl/);
});

test("renderWorkflow: autoPhaseFollowup === true — Step N+1 section + envelope-schema field render", () => {
  const out = renderWorkflow({ ...baseVars, autoPhaseFollowup: true });
  // The instructional section.
  assert.match(out, /## Step N\+1 — Auto-file next phase \(if applicable\)/);
  assert.match(out, /Phase X:/);
  assert.match(out, /## Phases/);
  assert.match(out, /gh issue create --title 'Phase N\+1:/);
  assert.match(out, /Set `nextPhaseIssueUrl` in your envelope/);
  // The envelope-schema example in Step 4 documents the field.
  assert.match(out, /"nextPhaseIssueUrl":/);
  // Section sits between Step 3.5 and Step 4.
  const stepNplus1 = out.indexOf("## Step N+1");
  const step4 = out.indexOf("## Step 4 — Emit the JSON envelope");
  assert.ok(stepNplus1 > 0, "Step N+1 must appear");
  assert.ok(step4 > stepNplus1, "Step 4 must follow Step N+1");
});

test("renderWorkflow: autoPhaseFollowup off vs on differ ONLY by the new section + envelope field", () => {
  const off = renderWorkflow(baseVars);
  const on = renderWorkflow({ ...baseVars, autoPhaseFollowup: true });
  assert.ok(on.length > off.length, "on-rendering must be a strict superset");
  // Removing the on-only fragments yields the off-rendering (modulo
  // the leading newlines that bracket the conditional template).
  // This is the regression guard: any other drift between the two
  // renderings would be a sign the conditional leaked into a default.
  assert.ok(on.includes("## Step N+1 — Auto-file next phase"));
  assert.ok(!off.includes("Step N+1"));
  assert.ok(on.includes('"nextPhaseIssueUrl":'));
  assert.ok(!off.includes("nextPhaseIssueUrl"));
});
