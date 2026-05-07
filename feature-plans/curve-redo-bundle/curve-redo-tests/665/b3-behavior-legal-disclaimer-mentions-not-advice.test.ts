import { test, expect } from "vitest";

test("disclaimer constant explicitly negates financial advice", async () => {
  const mod: any = await import("../src/legal/disclaimer.js");
  const text: string =
    mod.NOT_FINANCIAL_ADVICE ?? mod.LEGAL_DISCLAIMER ?? mod.DISCLAIMER ?? mod.default;
  expect(text.toLowerCase()).toMatch(/not\s+(?:a\s+source\s+of\s+)?(?:financial|investment)\s+advice|no\s+financial\s+advice/);
});
