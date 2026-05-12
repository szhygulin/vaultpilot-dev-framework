import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("sdkBinary.ts has rationale doc block (at least 3 // or /* comment lines)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  const lineComments = (src.match(/^\s*\/\//gm) || []).length;
  const blockComments = (src.match(/\/\*[\s\S]*?\*\//g) || []).length;
  assert.ok(lineComments + blockComments * 3 >= 3);
});
