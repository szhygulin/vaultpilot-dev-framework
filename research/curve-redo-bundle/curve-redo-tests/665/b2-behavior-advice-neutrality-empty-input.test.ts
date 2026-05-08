import { test, expect } from "vitest";

test("containsPersonalAdvice('') returns false (empty input edge case)", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  expect(typeof mod.containsPersonalAdvice).toBe("function");
  expect(mod.containsPersonalAdvice("")).toBe(false);
});
