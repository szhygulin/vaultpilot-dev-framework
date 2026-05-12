// Repay emits.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 compound repay emits", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/compound/actions.ts"), "utf8");
  expect(src).toMatch(/buildCompoundRepay[\s\S]*?durableBindings/);
});
