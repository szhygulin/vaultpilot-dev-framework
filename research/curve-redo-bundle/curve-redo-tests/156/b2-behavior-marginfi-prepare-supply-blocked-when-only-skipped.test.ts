import { test, expect } from "vitest";

test("prepare-supply path errors actionably when the canonical bank is skipped at decode", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js").catch(() => ({}));
  const prepare =
    mod.prepareMarginfiSupply ?? mod.prepare_marginfi_supply ?? mod.buildMarginfiSupply;
  if (typeof prepare !== "function") {
    expect.fail("prepareMarginfiSupply export missing — required for actionable error path");
  }
  const out = await Promise.resolve(
    prepare({
      symbol: "USDC",
      amount: "1",
      // Inject a fake group state where USDC's only bank is variant-15 skipped.
      __testGroupState: {
        banks: new Map(),
        skippedBanks: [
          {
            address: "Be5LNs1111111111111111111111111111111111111",
            mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            oracleSetup: 15,
            reason: "decode",
          },
        ],
      },
    }),
  ).catch((e: unknown) => e);
  const text =
    out instanceof Error
      ? out.message
      : typeof out === "string"
        ? out
        : JSON.stringify(out ?? "");
  expect(text.toLowerCase()).toMatch(/skipp|schema|decode/);
});
