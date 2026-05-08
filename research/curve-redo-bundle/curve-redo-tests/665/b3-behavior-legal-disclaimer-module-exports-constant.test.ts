import { test, expect } from "vitest";

test("legal disclaimer module exports a non-empty disclaimer string", async () => {
  const mod: any = await import("../src/legal/disclaimer.js");
  const text =
    mod.NOT_FINANCIAL_ADVICE ?? mod.LEGAL_DISCLAIMER ?? mod.DISCLAIMER ?? mod.default;
  expect(typeof text).toBe("string");
  expect((text as string).trim().length).toBeGreaterThan(20);
});
