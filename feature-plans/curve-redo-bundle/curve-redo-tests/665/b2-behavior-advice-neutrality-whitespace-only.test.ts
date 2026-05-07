import { test, expect } from "vitest";

test("containsPersonalAdvice('   ') returns false (whitespace edge case)", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  expect(mod.containsPersonalAdvice("   ")).toBe(false);
  expect(mod.containsPersonalAdvice("\t\n\r")).toBe(false);
});
