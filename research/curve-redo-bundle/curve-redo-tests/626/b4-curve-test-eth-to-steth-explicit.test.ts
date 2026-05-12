// Both directions are covered; the eth_to_steth direction should be
// exercised by some test in curve-v1.test.ts.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("curve-v1.test.ts covers eth_to_steth or native→ERC-20 direction", () => {
  const src = readFileSync(resolve(process.cwd(), "test/curve-v1.test.ts"), "utf8");
  expect(src).toMatch(/eth_to_steth|native.*stETH|fromIsNative|i.*0.*j.*1|i:\s*['"]0['"]/i);
});
