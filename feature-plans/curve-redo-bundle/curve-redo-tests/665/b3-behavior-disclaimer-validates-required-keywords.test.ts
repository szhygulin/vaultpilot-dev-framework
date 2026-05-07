import { test, expect } from "vitest";

test("validateDisclaimer throws when required keywords are missing", async () => {
  const mod: any = await import("../src/legal/disclaimer.js");
  const validate = mod.validateDisclaimer ?? mod.assertValidDisclaimer ?? mod.checkDisclaimer;
  expect(typeof validate).toBe("function");
  expect(() => validate("hello world")).toThrow();
  expect(() => validate("")).toThrow();
});
