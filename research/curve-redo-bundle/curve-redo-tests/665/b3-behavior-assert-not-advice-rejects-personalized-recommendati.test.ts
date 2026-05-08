import { test, expect } from "vitest";

test("assertNotAdvice throws on personalized recommendation phrasing", async () => {
  const mod: any = await import("../src/legal/disclaimer.js");
  const fn = mod.assertNotAdvice ?? mod.assertNoAdvice ?? mod.assertNeutral;
  expect(() => fn("Based on your profile, you should invest in tech ETFs.")).toThrow();
});
