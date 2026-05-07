import { test, expect } from "vitest";

test("wrapWithDisclaimer's output contains ADVISORY_DISCLAIMER as a substring", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  const wrapped: string = mod.wrapWithDisclaimer("hello");
  const disclaimer: string = mod.ADVISORY_DISCLAIMER;
  expect(wrapped).toContain(disclaimer);
});
