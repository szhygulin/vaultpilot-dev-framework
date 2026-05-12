// RunConfirmParams.maxCostUsd optional.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b5 runconfirm maxcost optional", () => {
  const src = readFileSync(resolve(process.cwd(), "src/state/runConfirm.ts"), "utf8");
  assert.match(src, /maxCostUsd\s*\?\s*:\s*string/);
});
