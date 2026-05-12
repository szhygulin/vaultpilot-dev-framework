import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("replay.ts doc-block mentions cross-cell or sibling-cell concept", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  assert.match(src, /cross.cell|sibling cell|shared.*config|cross-cell/i);
});
