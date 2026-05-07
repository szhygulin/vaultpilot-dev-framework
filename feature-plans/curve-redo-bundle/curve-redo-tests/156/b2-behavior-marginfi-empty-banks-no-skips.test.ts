import { test, expect } from "vitest";

test("empty bank list yields zero skipped banks", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js").catch(() => ({}));
  const fn = mod.fetchGroupDataOverride ?? mod.default?.fetchGroupDataOverride;
  if (typeof fn !== "function") {
    expect.fail("fetchGroupDataOverride export missing — required for skip-tolerant decode path");
  }
  const result = await fn({ bankAccounts: [] }, { skipDecode: true }).catch((e: unknown) => e);
  // Whatever shape, no exception expected and skip list must be empty/absent.
  if (result instanceof Error) {
    expect.fail(`fetchGroupDataOverride threw on empty bank list: ${result.message}`);
  }
  const skipped = (result as any)?.skippedBanks ?? (result as any)?.skipped ?? [];
  expect(Array.isArray(skipped)).toBe(true);
  expect(skipped.length).toBe(0);
});
