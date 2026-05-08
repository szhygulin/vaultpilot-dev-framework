import { test, expect } from "vitest";

test("wrapWithDisclaimer is idempotent — calling twice does not duplicate the disclaimer", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  const once = mod.wrapWithDisclaimer("hello");
  const twice = mod.wrapWithDisclaimer(once);
  // once and twice should be equal — wrapping an already-wrapped string should be a no-op
  expect(twice).toBe(once);
});
