import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCurveStudySpawnArgs,
  type CellSpec,
  type DispatchOptions,
} from "./dispatch.js";

const CELL: CellSpec = {
  devAgentId: "agent-2a3d",
  issueId: 156,
  clonePath: "/tmp/fake-clone",
};

const BASE_OPTS: DispatchOptions = {
  cells: [CELL],
  targetRepo: "szhygulin/vaultpilot-mcp",
  logsDir: "/tmp/fake-logs",
  logPrefix: "curve-",
  cwd: process.cwd(),
};

test("buildCurveStudySpawnArgs: includes --research-mode by default (#248)", () => {
  // Curve-study cells fan out across the specialist roster; without
  // --research-mode every cell would mutate the registry (issuesHandled,
  // counters, lastActiveAt, applied tags), forcing an operator-level
  // snapshot+restore around the experiment. Both --skip-summary AND
  // --research-mode should appear — the former is the long-standing
  // documented contract; the latter (#248) is the new registry-mutation
  // gate.
  const args = buildCurveStudySpawnArgs(CELL, BASE_OPTS);
  assert.ok(args.includes("--research-mode"), `expected --research-mode in: ${args.join(" ")}`);
  assert.ok(args.includes("--skip-summary"), `expected --skip-summary in: ${args.join(" ")}`);
  assert.equal(args[0], "run");
  assert.equal(args[1], "vp-dev");
  assert.equal(args[3], "spawn");
});

test("buildCurveStudySpawnArgs: optional flags push onto the end without dropping --research-mode", () => {
  const args = buildCurveStudySpawnArgs(CELL, {
    ...BASE_OPTS,
    dryRun: true,
    allowClosedIssue: true,
    issueBodyOnly: true,
    suppressTargetClaudeMd: true,
  });
  // The static head still carries the research-mode block.
  assert.ok(args.includes("--research-mode"));
  assert.ok(args.includes("--skip-summary"));
  // And every optional flag was appended.
  assert.ok(args.includes("--dry-run"));
  assert.ok(args.includes("--allow-closed-issue"));
  assert.ok(args.includes("--issue-body-only"));
  assert.ok(args.includes("--no-target-claude-md"));
});
