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
