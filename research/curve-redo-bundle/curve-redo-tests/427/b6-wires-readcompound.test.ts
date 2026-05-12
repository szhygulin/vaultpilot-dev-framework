// Wires Compound reader.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b6 wires readcompound", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/positions/index.ts"), "utf8");
  expect(src).toMatch(/getHealthAlerts[\s\S]{0,5000}readCompoundAtRisk/);
});
