// positions/aave consumes readAaveUserReservesData.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 positions aave uses helpers", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/positions/aave.ts"), "utf8");
  expect(src).toMatch(/readAaveUserReservesData/);
});
