// buildResumeContextMap dynamic-import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildResumeContextMap } from "../cli.js";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

test("b8 build resume enriches from state file", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rc-"));
  try {
    const runId = "run-X";
    await fs.writeFile(path.join(dir, `${runId}.json`), JSON.stringify({issues:{"3":{errorSubtype:"error_max_turns", error:"hit cap", partialBranchUrl:"https://x/y"}}}));
    const incomplete = new Map([[3, [{issueId:3, agentId:"a", branchName:"b", runId}]]]);
    const m = await buildResumeContextMap({ incompleteOrigin: incomplete, stateDir: dir });
    const c = m.get(3);
    assert.equal(c.errorSubtype, "error_max_turns");
    assert.equal(c.finalText, "hit cap");
    assert.equal(c.partialBranchUrl, "https://x/y");
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
