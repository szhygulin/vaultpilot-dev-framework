import { test, expect } from "vitest";

test("wrapWithDisclaimer return value is always a string for empty/whitespace inputs", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  expect(typeof mod.wrapWithDisclaimer("")).toBe("string");
  expect(typeof mod.wrapWithDisclaimer(" ")).toBe("string");
  expect(typeof mod.wrapWithDisclaimer("\n")).toBe("string");
});
