// buildResumeContextMap dynamic-import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildResumeContextMap } from "../cli.js";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

test("b8 build resume empty input empty map", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rc-"));
  try {
    const m = await buildResumeContextMap({ incompleteOrigin: new Map(), stateDir: dir });
    assert.equal(m.size, 0);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
