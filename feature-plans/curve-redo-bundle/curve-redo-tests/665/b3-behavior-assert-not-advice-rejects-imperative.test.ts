import { test, expect } from "vitest";

test("assertNotAdvice throws when output contains imperative buy/sell instruction", async () => {
  const mod: any = await import("../src/legal/disclaimer.js");
  const fn = mod.assertNotAdvice ?? mod.assertNoAdvice ?? mod.assertNeutral;
  expect(typeof fn).toBe("function");
  expect(() => fn("You should buy AAPL right now")).toThrow();
});
