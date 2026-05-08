import { test, expect } from "vitest";

test("reassigning the disclaimer to empty must not produce a valid disclaimer", async () => {
  const mod: any = await import("../src/legal/disclaimer.js");
  const text: string =
    mod.NOT_FINANCIAL_ADVICE ?? mod.LEGAL_DISCLAIMER ?? mod.DISCLAIMER ?? mod.default;
  // Modules are typically immutable when imported as ES modules. Attempting
  // to assign should not silently turn the disclaimer into an empty string.
  try {
    (mod as any).NOT_FINANCIAL_ADVICE = "";
  } catch {
    /* expected in strict ESM */
  }
  const after =
    (mod as any).NOT_FINANCIAL_ADVICE ?? mod.LEGAL_DISCLAIMER ?? mod.DISCLAIMER ?? mod.default;
  expect(typeof after).toBe("string");
  expect((after as string).trim().length).toBeGreaterThan(0);
  expect(after).toBe(text);
});
