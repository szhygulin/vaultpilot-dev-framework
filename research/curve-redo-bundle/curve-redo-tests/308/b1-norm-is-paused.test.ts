// isPaused.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 norm is paused", () => {
  const src = readFileSync(resolve(process.cwd(), "src/abis/aave-ui-pool-data-provider.ts"), "utf8");
  expect(src).toMatch(/AaveReserveNormalized[\s\S]*?isPaused\s*:\s*boolean/);
});
