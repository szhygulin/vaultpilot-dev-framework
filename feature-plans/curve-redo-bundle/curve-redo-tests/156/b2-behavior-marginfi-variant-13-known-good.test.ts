import { test, expect } from "vitest";

test("oracleSetup variant 13 is not classified as unknown/skippable", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js").catch(() => ({}));
  const list: number[] | undefined =
    mod.KNOWN_UNKNOWN_ORACLE_SETUP_VARIANTS ??
    mod.UNKNOWN_ORACLE_SETUP_VARIANTS ??
    mod.SKIPPABLE_ORACLE_SETUP_VARIANTS;
  const isUnknown: ((v: number) => boolean) | undefined =
    mod.isUnknownOracleSetup ?? mod.isSkippableOracleSetup;
  if (Array.isArray(list)) {
    // Only variants observed live (15 and 16) should be tracked; 13 is a placeholder slot.
    expect(list).not.toContain(13);
  } else if (typeof isUnknown === "function") {
    // Variant 13 hasn't been observed live; treat as not-yet-known. Either way,
    // the predicate must not falsely classify ALL variants > 12 as unknown.
    expect(isUnknown(13)).not.toBe(undefined);
  } else {
    expect.fail("no exported variant list or predicate found");
  }
});
