// Aave/HF doc-comment cites unified rule.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 aave rule comment", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/positions/index.ts"), "utf8");
  expect(src).toMatch(/healthFactor[\s\S]*?lltv|lltv[\s\S]*?healthFactor|liquidationCollateralFactor|liquidateCollateralFactor/i);
});
