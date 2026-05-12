// maxCostUsd doc cites resume.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 types maxcost doc resume", () => {
  const src = readFileSync(resolve(process.cwd(), "src/types.ts"), "utf8");
  assert.match(src, /maxCostUsd[\s\S]*?resume|resume[\s\S]*?maxCostUsd/i);
});
