import { test, expect } from "vitest";

test("oracleSetup variant 0 is not in the unknown-variant set", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js").catch(() => ({}));
  const list: number[] | undefined =
    mod.KNOWN_UNKNOWN_ORACLE_SETUP_VARIANTS ??
    mod.UNKNOWN_ORACLE_SETUP_VARIANTS ??
    mod.SKIPPABLE_ORACLE_SETUP_VARIANTS;
  const isUnknown: ((v: number) => boolean) | undefined =
    mod.isUnknownOracleSetup ?? mod.isSkippableOracleSetup;
  if (Array.isArray(list)) {
    expect(list).not.toContain(0);
  } else if (typeof isUnknown === "function") {
    expect(isUnknown(0)).toBe(false);
  } else {
    expect.fail("no exported variant list or predicate found");
  }
});
