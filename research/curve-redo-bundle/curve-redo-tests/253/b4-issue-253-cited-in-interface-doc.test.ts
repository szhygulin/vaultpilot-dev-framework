import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("interface doc-block or restore doc cites issue #253", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  // At least one reference appears in a comment context near the new code
  assert.match(src, /#253/);
});
