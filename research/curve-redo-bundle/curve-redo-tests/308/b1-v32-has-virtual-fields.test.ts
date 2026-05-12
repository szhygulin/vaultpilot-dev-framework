// V3.2 mentions virtualUnderlyingBalance or virtualAccActive.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 v32 has virtual fields", () => {
  const src = readFileSync(resolve(process.cwd(), "src/abis/aave-ui-pool-data-provider.ts"), "utf8");
  expect(src).toMatch(/reservesV3_2[\s\S]*?(virtualUnderlyingBalance|virtualAccActive)/);
});
