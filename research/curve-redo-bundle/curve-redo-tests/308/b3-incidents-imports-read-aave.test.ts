// incidents imports helper.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 incidents imports read aave", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/incidents/index.ts"), "utf8");
  expect(src).toMatch(/readAaveReservesData/);
});
