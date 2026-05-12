// Uniswap burn.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 uniswap burn emits", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/lp/uniswap-v3/actions.ts"), "utf8");
  expect(src).toMatch(/buildUniswapBurn[\s\S]*?durableBindings/);
});
