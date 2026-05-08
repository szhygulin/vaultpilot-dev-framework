import { test, expect } from "vitest";

test("no exported disclaimer-shaped string is empty", async () => {
  const mod: any = await import("../src/legal/disclaimer.js");
  const candidates = [
    "NOT_FINANCIAL_ADVICE",
    "LEGAL_DISCLAIMER",
    "DISCLAIMER",
    "default",
  ];
  let found = 0;
  for (const k of candidates) {
    if (typeof mod[k] === "string") {
      found++;
      expect(mod[k].trim().length).toBeGreaterThan(0);
    }
  }
  expect(found).toBeGreaterThan(0);
});
