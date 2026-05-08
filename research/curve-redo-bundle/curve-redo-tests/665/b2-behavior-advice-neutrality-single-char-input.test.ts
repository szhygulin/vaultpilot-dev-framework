import { test, expect } from "vitest";

test("containsPersonalAdvice on a single neutral character returns false", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  expect(mod.containsPersonalAdvice("a")).toBe(false);
  expect(mod.containsPersonalAdvice(".")).toBe(false);
  expect(mod.containsPersonalAdvice("1")).toBe(false);
});
