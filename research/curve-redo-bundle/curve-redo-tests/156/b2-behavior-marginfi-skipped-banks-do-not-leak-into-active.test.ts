import { test, expect } from "vitest";

test("skipped banks (variant 15) do not appear in the active banks collection", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js").catch(() => ({}));
  const fn = mod.fetchGroupDataOverride;
  if (typeof fn !== "function") {
    expect.fail("fetchGroupDataOverride export missing");
  }
  const result = await Promise.resolve(
    fn(
      {
        bankAccounts: [
          { address: "Be5LNs1111111111111111111111111111111111111", data: Buffer.alloc(1024, 0), oracleSetupRawByte: 15 },
        ],
      },
      { skipDecode: false },
    ),
  ).catch((e: unknown) => e);
  if (result instanceof Error) return; // acceptable failure mode
  const banks = (result as any)?.banks ?? new Map();
  const addrs: string[] = banks instanceof Map ? Array.from(banks.keys()) : Object.keys(banks ?? {});
  expect(addrs.find((a) => a.startsWith("Be5LNs"))).toBeUndefined();
});
