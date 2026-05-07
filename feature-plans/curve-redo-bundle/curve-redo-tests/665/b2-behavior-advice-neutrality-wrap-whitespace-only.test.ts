import { test, expect } from "vitest";

test("wrapWithDisclaimer('   ') emits the disclaimer text (whitespace-only edge)", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  const out: string = mod.wrapWithDisclaimer("   ");
  expect(out.length).toBeGreaterThan(3);
  expect(out).toContain(mod.ADVISORY_DISCLAIMER);
});
