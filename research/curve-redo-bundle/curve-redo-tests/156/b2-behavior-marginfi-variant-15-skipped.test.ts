import { test, expect } from "vitest";

test("oracleSetup variant 15 is recognized as a skippable unknown variant", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js").catch(() => ({}));
  // Look for either an exported list of known-unknown variants, or a predicate.
  const list: number[] | undefined =
    mod.KNOWN_UNKNOWN_ORACLE_SETUP_VARIANTS ??
    mod.UNKNOWN_ORACLE_SETUP_VARIANTS ??
    mod.SKIPPABLE_ORACLE_SETUP_VARIANTS;
  const isUnknown: ((v: number) => boolean) | undefined =
    mod.isUnknownOracleSetup ?? mod.isSkippableOracleSetup;
  if (Array.isArray(list)) {
    expect(list).toContain(15);
    expect(list).toContain(16);
  } else if (typeof isUnknown === "function") {
    expect(isUnknown(15)).toBe(true);
    expect(isUnknown(16)).toBe(true);
  } else {
    expect.fail("no exported variant list or predicate found — required to track variants 15 & 16");
  }
});
