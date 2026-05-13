// buildResumeContextMap dynamic-import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildResumeContextMap } from "../cli.js";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

test("b8 build resume skips empty ref list", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rc-"));
  try {
    const incomplete = new Map([[7, []]]);
    const m = await buildResumeContextMap({ incompleteOrigin: incomplete, stateDir: dir });
    assert.equal(m.has(7), false);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
