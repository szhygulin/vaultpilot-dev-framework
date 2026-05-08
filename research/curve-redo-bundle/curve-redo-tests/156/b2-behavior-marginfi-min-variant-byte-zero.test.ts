import { test, expect } from "vitest";

test("u8::MIN (0) oracleSetup variant is never classified as unknown", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js").catch(() => ({}));
  const isUnknown: ((v: number) => boolean) | undefined =
    mod.isUnknownOracleSetup ?? mod.isSkippableOracleSetup;
  if (typeof isUnknown === "function") {
    expect(isUnknown(0)).toBe(false);
    return;
  }
  const list: number[] | undefined =
    mod.KNOWN_UNKNOWN_ORACLE_SETUP_VARIANTS ??
    mod.UNKNOWN_ORACLE_SETUP_VARIANTS ??
    mod.SKIPPABLE_ORACLE_SETUP_VARIANTS;
  if (Array.isArray(list)) {
    expect(list).not.toContain(0);
    return;
  }
  expect.fail("no isUnknownOracleSetup predicate or variant list exported");
});
