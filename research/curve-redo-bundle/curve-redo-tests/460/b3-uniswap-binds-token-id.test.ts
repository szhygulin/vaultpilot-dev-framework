// Uniswap binds tokenId.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 uniswap binds token id", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/lp/uniswap-v3/actions.ts"), "utf8");
  expect(src).toMatch(/uniswap-v3-lp-token-id["']\s*,\s*p\.tokenId/);
});
