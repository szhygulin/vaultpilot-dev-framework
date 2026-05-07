import { test, expect } from "vitest";

test("containsPersonalAdvice detects a single advice keyword embedded in surrounding text", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  const kws: string[] = mod.ADVICE_KEYWORDS;
  const sample = kws[0];
  const haystack = `Some neutral preamble. ${sample} something else after.`;
  expect(mod.containsPersonalAdvice(haystack)).toBe(true);
});
