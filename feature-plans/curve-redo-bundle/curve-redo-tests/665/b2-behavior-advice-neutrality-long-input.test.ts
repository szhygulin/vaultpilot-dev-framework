import { test, expect } from "vitest";

test("containsPersonalAdvice tolerates a very large input string", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  const big = "a ".repeat(50_000); // ~100kb of neutral text
  expect(() => mod.containsPersonalAdvice(big)).not.toThrow();
  expect(mod.containsPersonalAdvice(big)).toBe(false);
});
