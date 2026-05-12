import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("buildCurveSwap is async (returns Promise)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  expect(src).toMatch(/async\s+function\s+buildCurveSwap|buildCurveSwap[\s\S]{0,200}Promise/);
});
