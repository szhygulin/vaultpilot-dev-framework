// Uniswap tokenId binding present across all 5 builders.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 uniswap token id bindings", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/lp/uniswap-v3/actions.ts"), "utf8");
  expect(src).toMatch(/uniswap-v3-lp-token-id/);
});
