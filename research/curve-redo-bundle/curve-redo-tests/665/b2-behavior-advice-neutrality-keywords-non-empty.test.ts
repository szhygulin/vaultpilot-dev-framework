import { test, expect } from "vitest";

test("ADVICE_KEYWORDS is a non-empty array", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  expect(Array.isArray(mod.ADVICE_KEYWORDS)).toBe(true);
  expect(mod.ADVICE_KEYWORDS.length).toBeGreaterThan(0);
});
