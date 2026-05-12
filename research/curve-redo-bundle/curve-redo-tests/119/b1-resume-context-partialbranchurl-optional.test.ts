// ResumeContext has optional `partialBranchUrl`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 resume context partialbranchurl optional", () => {
  const src = readFileSync(resolve(process.cwd(), "src/types.ts"), "utf8");
  assert.match(src, /ResumeContext[\s\S]*?partialBranchUrl\s*\?\s*:/);
});
