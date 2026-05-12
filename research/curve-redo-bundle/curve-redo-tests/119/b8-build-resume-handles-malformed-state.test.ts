// buildResumeContextMap dynamic-import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildResumeContextMap } from "../cli.js";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

test("b8 build resume handles malformed state", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rc-"));
  try {
    const runId = "run-BAD";
    await fs.writeFile(path.join(dir, `${runId}.json`), "{ not valid json");
    const incomplete = new Map([[2, [{issueId:2, agentId:"a", branchName:"b", runId}]]]);
    const m = await buildResumeContextMap({ incompleteOrigin: incomplete, stateDir: dir });
    const c = m.get(2);
    assert.ok(c);
    assert.equal(c.errorSubtype, undefined);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
