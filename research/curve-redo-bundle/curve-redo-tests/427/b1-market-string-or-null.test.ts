// market: string|null.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 market string or null", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/positions/index.ts"), "utf8");
  expect(src).toMatch(/HealthAlertRow[\s\S]*?market\s*:\s*string\s*\|\s*null/);
});
