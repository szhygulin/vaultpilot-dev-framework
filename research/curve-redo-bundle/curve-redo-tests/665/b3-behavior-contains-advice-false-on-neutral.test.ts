import { test, expect } from "vitest";

test("containsAdviceLanguage returns false on a purely informational sentence", async () => {
  const mod: any = await import("../src/legal/disclaimer.js");
  const fn = mod.containsAdviceLanguage ?? mod.isAdvice ?? mod.detectAdvice;
  expect(fn("The S&P 500 closed up 0.4% today.")).toBe(false);
});
