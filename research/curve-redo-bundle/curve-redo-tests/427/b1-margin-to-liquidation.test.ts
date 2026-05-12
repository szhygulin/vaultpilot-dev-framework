// marginToLiquidation: number.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 margin to liquidation", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/positions/index.ts"), "utf8");
  expect(src).toMatch(/HealthAlertRow[\s\S]*?marginToLiquidation\s*:\s*number/);
});
