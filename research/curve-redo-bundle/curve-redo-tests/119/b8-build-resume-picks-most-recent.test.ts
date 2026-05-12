// buildResumeContextMap dynamic-import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildResumeContextMap } from "../cli.js";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

test("b8 build resume picks most recent", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rc-"));
  try {
    const incomplete = new Map([[5, [{issueId:5, agentId:"a", branchName:"b1", runId:"run-2026-05-01"}, {issueId:5, agentId:"b", branchName:"b2", runId:"run-2026-05-04"}]]]);
    const m = await buildResumeContextMap({ incompleteOrigin: incomplete, stateDir: dir });
    assert.equal(m.get(5).runId, "run-2026-05-04");
    assert.equal(m.get(5).agentId, "b");
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
