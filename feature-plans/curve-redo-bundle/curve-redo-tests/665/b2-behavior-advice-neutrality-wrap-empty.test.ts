import { test, expect } from "vitest";

test("wrapWithDisclaimer('') still emits disclaimer (empty input boundary)", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  const out = mod.wrapWithDisclaimer("");
  expect(typeof out).toBe("string");
  expect((out as string).length).toBeGreaterThan(0);
  // disclaimer text should be present even when wrapping empty content
  expect((out as string).toLowerCase()).toMatch(/advice|advisory|informational|not.*financial/);
});
