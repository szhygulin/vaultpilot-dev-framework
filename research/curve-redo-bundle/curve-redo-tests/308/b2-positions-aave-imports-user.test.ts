// positions/aave imports user reader.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 positions aave imports user", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/positions/aave.ts"), "utf8");
  expect(src).toMatch(/readAaveUserReservesData/);
});
