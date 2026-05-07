import { test, expect } from "vitest";

test("containsPersonalAdvice('\\n') returns false (control-char-only edge)", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  expect(mod.containsPersonalAdvice("\n")).toBe(false);
  expect(mod.containsPersonalAdvice("\n\n\n")).toBe(false);
});
