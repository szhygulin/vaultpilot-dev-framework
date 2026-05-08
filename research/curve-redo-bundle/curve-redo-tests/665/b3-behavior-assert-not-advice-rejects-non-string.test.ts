import { test, expect } from "vitest";

test("assertNotAdvice throws TypeError-like error on non-string input", async () => {
  const mod: any = await import("../src/legal/disclaimer.js");
  const fn = mod.assertNotAdvice ?? mod.assertNoAdvice ?? mod.assertNeutral;
  expect(() => fn(undefined as any)).toThrow();
  expect(() => fn(null as any)).toThrow();
  expect(() => fn(42 as any)).toThrow();
});
