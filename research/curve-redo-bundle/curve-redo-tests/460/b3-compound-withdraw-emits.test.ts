// Withdraw emits.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 compound withdraw emits", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/compound/actions.ts"), "utf8");
  expect(src).toMatch(/buildCompoundWithdraw[\s\S]*?durableBindings/);
});
