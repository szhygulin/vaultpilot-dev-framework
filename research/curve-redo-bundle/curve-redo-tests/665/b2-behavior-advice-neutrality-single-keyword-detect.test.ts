import { test, expect } from "vitest";

test("containsPersonalAdvice flags an input that is just a single advice keyword", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  const kws: string[] = mod.ADVICE_KEYWORDS;
  expect(kws.length).toBeGreaterThan(0);
  // pick any one keyword and assert detection
  const sample = kws[0];
  expect(mod.containsPersonalAdvice(sample)).toBe(true);
});
