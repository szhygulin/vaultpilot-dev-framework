import { test, expect } from "vitest";

test("containsAdviceLanguage flags 'guaranteed returns' phrasing", async () => {
  const mod: any = await import("../src/legal/disclaimer.js");
  const fn = mod.containsAdviceLanguage ?? mod.isAdvice ?? mod.detectAdvice;
  expect(fn("guaranteed returns of 20% per month if you act now")).toBe(true);
});
