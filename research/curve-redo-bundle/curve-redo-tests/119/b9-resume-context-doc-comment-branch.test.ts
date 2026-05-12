// ResumeContext doc-comment describes 'branch'.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b9 resume context doc comment branch", () => {
  const src = readFileSync(resolve(process.cwd(), "src/types.ts"), "utf8");
  assert.match(src, /branch[\s\S]*?salvage|salvage[\s\S]*?branch/i);
});
