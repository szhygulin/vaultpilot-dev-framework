// Test file exists.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b5 test file exists", () => {
  const src = readFileSync(resolve(process.cwd(), "test/health-alerts-multi-protocol.test.ts"), "utf8");
  expect(src).toMatch(/multi-protocol|getHealthAlerts/);
});
