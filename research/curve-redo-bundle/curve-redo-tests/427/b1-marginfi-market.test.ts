// MarginFi market.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 marginfi market", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/positions/index.ts"), "utf8");
  expect(src).toMatch(/marginfi[\s\S]*?(MarginfiAccount|market|marginfiAccount)/);
});
