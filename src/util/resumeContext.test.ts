import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildResumeContextMap, parseIssueIdFromBranch } from "../cli.js";

// `buildResumeContextMap` is the CLI helper that translates the salvage-ref
// enumeration into a per-issue ResumeContext map for the orchestrator
// (issue #119 Phase 2). Pure-ish: reads run-state JSON files from disk via
// the injectable `stateDir` parameter, so these tests exercise that branch
// alongside the no-state-file fallback.

test("buildResumeContextMap: picks the most recent salvage ref per issue (lex-sort runId desc)", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "resume-ctx-"));
  try {
    const incomplete = new Map([
      [
        88,
        [
          {
            issueId: 88,
            agentId: "agent-aa00",
            branchName: "vp-dev/agent-aa00/issue-88-incomplete-run-2026-05-01T12-00-00-000Z",
            runId: "run-2026-05-01T12-00-00-000Z",
          },
          // Most recent — should win the per-issue pick.
          {
            issueId: 88,
            agentId: "agent-bb11",
            branchName: "vp-dev/agent-bb11/issue-88-incomplete-run-2026-05-04T08-00-00-000Z",
            runId: "run-2026-05-04T08-00-00-000Z",
          },
        ],
      ],
    ]);
    const map = await buildResumeContextMap({ incompleteOrigin: incomplete, stateDir: dir });
    const ctx = map.get(88);
    assert.ok(ctx, "expected a context for issue 88");
    assert.equal(ctx!.runId, "run-2026-05-04T08-00-00-000Z");
    assert.equal(ctx!.agentId, "agent-bb11");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("buildResumeContextMap: enriches from state/<runId>.json when present", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "resume-ctx-"));
  try {
    const runId = "run-2026-05-04T16-53-06-188Z";
    const branch = `vp-dev/agent-08c4/issue-86-incomplete-${runId}`;
    const state = {
      runId,
      issues: {
        "86": {
          status: "failed",
          error: "error_max_turns",
          errorSubtype: "error_max_turns",
          partialBranchUrl: `https://github.com/owner/repo/tree/${encodeURIComponent(branch)}`,
        },
      },
    };
    await fs.writeFile(path.join(dir, `${runId}.json`), JSON.stringify(state));
    const incomplete = new Map([
      [
        86,
        [{ issueId: 86, agentId: "agent-08c4", branchName: branch, runId }],
      ],
    ]);
    const map = await buildResumeContextMap({ incompleteOrigin: incomplete, stateDir: dir });
    const ctx = map.get(86);
    assert.ok(ctx, "expected a context for issue 86");
    assert.equal(ctx!.errorSubtype, "error_max_turns");
    assert.equal(ctx!.finalText, "error_max_turns");
    assert.match(ctx!.partialBranchUrl ?? "", /https:\/\/github\.com\/owner\/repo\/tree\//);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("buildResumeContextMap: degrades cleanly when state file is missing", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "resume-ctx-"));
  try {
    // No state file written — the helper should still produce a context
    // with branch/runId/agentId only.
    const incomplete = new Map([
      [
        99,
        [
          {
            issueId: 99,
            agentId: "agent-cc22",
            branchName: "vp-dev/agent-cc22/issue-99-incomplete-run-NOSTATE",
            runId: "run-NOSTATE",
          },
        ],
      ],
    ]);
    const map = await buildResumeContextMap({ incompleteOrigin: incomplete, stateDir: dir });
    const ctx = map.get(99);
    assert.ok(ctx);
    assert.equal(ctx!.runId, "run-NOSTATE");
    assert.equal(ctx!.errorSubtype, undefined);
    assert.equal(ctx!.finalText, undefined);
    assert.equal(ctx!.partialBranchUrl, undefined);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("buildResumeContextMap: empty input yields empty map", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "resume-ctx-"));
  try {
    const map = await buildResumeContextMap({
      incompleteOrigin: new Map(),
      stateDir: dir,
    });
    assert.equal(map.size, 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("parseIssueIdFromBranch: extracts the integer between issue- and -incomplete-", () => {
  assert.equal(
    parseIssueIdFromBranch("vp-dev/agent-aa00/issue-88-incomplete-run-X"),
    88,
  );
  assert.equal(
    parseIssueIdFromBranch("vp-dev/agent-ef41/issue-1234-incomplete-run-Y"),
    1234,
  );
});

test("parseIssueIdFromBranch: returns 0 for malformed inputs (best-effort)", () => {
  assert.equal(parseIssueIdFromBranch("vp-dev/agent-aa00/issue-88"), 0);
  assert.equal(parseIssueIdFromBranch("not-a-branch"), 0);
  assert.equal(parseIssueIdFromBranch(""), 0);
});
