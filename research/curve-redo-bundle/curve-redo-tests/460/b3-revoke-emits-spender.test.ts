// revoke emits spender binding.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 revoke emits spender", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/execution/index.ts"), "utf8");
  expect(src).toMatch(/approval-spender-address["']\s*,\s*spender/);
});
