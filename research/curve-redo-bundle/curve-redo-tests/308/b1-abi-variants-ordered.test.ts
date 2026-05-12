// ABI_VARIANTS lists three variants.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 abi variants ordered", () => {
  const src = readFileSync(resolve(process.cwd(), "src/abis/aave-ui-pool-data-provider.ts"), "utf8");
  expect(src).toMatch(/ABI_VARIANTS[\s\S]*?v3_2[\s\S]*?v3_3[\s\S]*?v3/);
});
