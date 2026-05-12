import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("buildCurveSwap is still exported (export keyword present)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  expect(src).toMatch(/export\s+(async\s+)?function\s+buildCurveSwap/);
});
