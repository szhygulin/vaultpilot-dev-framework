import { test, expect } from "vitest";

test("containsPersonalAdvice does not flag a neutral single-word input", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  // 'block' is a neutral chain term and should NOT be in the advice keyword list
  expect(mod.containsPersonalAdvice("block")).toBe(false);
});
