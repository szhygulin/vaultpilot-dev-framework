// Regression: buildCurveSwap must remain exported (the rest of the code
// imports it).
import { test, expect } from "vitest";

test("buildCurveSwap remains exported from src/modules/curve/actions.ts", async () => {
  const mod: any = await import("../src/modules/curve/actions.js");
  expect(typeof mod.buildCurveSwap).toBe("function");
});
