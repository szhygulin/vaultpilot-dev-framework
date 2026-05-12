// incidents uses helper not raw ABI readContract.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 incidents no raw abi", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/incidents/index.ts"), "utf8");
  expect(src).toMatch(/readAaveReservesData/);
});
