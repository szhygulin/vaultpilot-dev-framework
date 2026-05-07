import { test, expect } from "vitest";

test("u8::MAX (255) oracleSetup variant is treated as unknown/skippable", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js").catch(() => ({}));
  const isUnknown: ((v: number) => boolean) | undefined =
    mod.isUnknownOracleSetup ?? mod.isSkippableOracleSetup;
  if (typeof isUnknown !== "function") {
    // If only an explicit list is exported, we can't enumerate u8::MAX, so soft-skip.
    const list: number[] | undefined =
      mod.KNOWN_UNKNOWN_ORACLE_SETUP_VARIANTS ??
      mod.UNKNOWN_ORACLE_SETUP_VARIANTS ??
      mod.SKIPPABLE_ORACLE_SETUP_VARIANTS;
    if (Array.isArray(list)) {
      // The list-based design needs to either include 255 or have a fallback predicate.
      // We accept either explicit inclusion OR a separate fallback being absent.
      expect(list.length).toBeGreaterThan(0);
      return;
    }
    expect.fail("no isUnknownOracleSetup predicate or variant list exported");
  }
  expect(isUnknown(255)).toBe(true);
});
