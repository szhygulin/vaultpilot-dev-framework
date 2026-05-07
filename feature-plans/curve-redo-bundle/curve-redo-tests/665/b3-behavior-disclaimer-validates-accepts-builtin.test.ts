import { test, expect } from "vitest";

test("validateDisclaimer accepts the canonical exported disclaimer", async () => {
  const mod: any = await import("../src/legal/disclaimer.js");
  const validate = mod.validateDisclaimer ?? mod.assertValidDisclaimer ?? mod.checkDisclaimer;
  const text: string =
    mod.NOT_FINANCIAL_ADVICE ?? mod.LEGAL_DISCLAIMER ?? mod.DISCLAIMER ?? mod.default;
  expect(() => validate(text)).not.toThrow();
});
