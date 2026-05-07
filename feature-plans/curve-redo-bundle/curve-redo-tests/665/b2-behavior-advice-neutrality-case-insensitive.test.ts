import { test, expect } from "vitest";

test("containsPersonalAdvice matches the same keyword regardless of letter case", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  const kws: string[] = mod.ADVICE_KEYWORDS;
  const sample = kws[0];
  const lower = sample.toLowerCase();
  const upper = sample.toUpperCase();
  expect(mod.containsPersonalAdvice(lower)).toBe(mod.containsPersonalAdvice(upper));
  expect(mod.containsPersonalAdvice(upper)).toBe(true);
});
