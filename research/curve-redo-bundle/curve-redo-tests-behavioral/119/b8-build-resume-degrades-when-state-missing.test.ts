// buildResumeContextMap dynamic-import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildResumeContextMap } from "../cli.js";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

test("b8 build resume degrades when state missing", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rc-"));
  try {
    const incomplete = new Map([[9, [{issueId:9, agentId:"a", branchName:"b", runId:"run-NONE"}]]]);
    const m = await buildResumeContextMap({ incompleteOrigin: incomplete, stateDir: dir });
    const c = m.get(9);
    assert.ok(c);
    assert.equal(c.errorSubtype, undefined);
    assert.equal(c.partialBranchUrl, undefined);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
