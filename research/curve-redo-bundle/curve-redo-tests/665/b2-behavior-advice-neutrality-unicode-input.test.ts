import { test, expect } from "vitest";

test("containsPersonalAdvice tolerates unicode/emoji input and returns false when no keyword present", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  expect(() => mod.containsPersonalAdvice("💸🪙📈")).not.toThrow();
  expect(mod.containsPersonalAdvice("💸🪙📈")).toBe(false);
  expect(mod.containsPersonalAdvice("日本語のテスト")).toBe(false);
});
