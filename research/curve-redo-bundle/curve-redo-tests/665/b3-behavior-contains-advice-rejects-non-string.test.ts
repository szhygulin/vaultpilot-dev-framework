import { test, expect } from "vitest";

test("containsAdviceLanguage throws on non-string input", async () => {
  const mod: any = await import("../src/legal/disclaimer.js");
  const fn = mod.containsAdviceLanguage ?? mod.isAdvice ?? mod.detectAdvice;
  expect(() => fn(undefined as any)).toThrow();
  expect(() => fn(123 as any)).toThrow();
  expect(() => fn({} as any)).toThrow();
});
