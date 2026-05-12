// markAborted error string set verbatim.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b8 runstate mark aborted error comment", () => {
  const src = readFileSync(resolve(process.cwd(), "src/state/runState.ts"), "utf8");
  assert.match(src, /aborted-budget: per-run cost ceiling exceeded/);
});
