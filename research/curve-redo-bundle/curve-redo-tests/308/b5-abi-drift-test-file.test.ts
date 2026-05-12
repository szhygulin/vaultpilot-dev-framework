// ABI-drift test file.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b5 abi drift test file", () => {
  const src = readFileSync(resolve(process.cwd(), "test/aave-abi-drift.test.ts"), "utf8");
  expect(src).toMatch(/aave-ui-pool-data-provider|readAaveReservesData/);
});
