import { test, expect } from "vitest";

test("prepare_marginfi_supply rejects amount=0", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js");
  const fn = mod.prepareMarginfiSupply || mod.prepare_marginfi_supply || mod.prepareSupply;
  expect(typeof fn).toBe("function");
  let failed = false;
  try {
    const r = await fn({ symbol: "USDC", amount: "0", owner: "11111111111111111111111111111112" });
    if (r && typeof r === "object" && ("error" in r || "errors" in r)) failed = true;
    if (r === null || r === undefined) failed = true;
  } catch {
    failed = true;
  }
  expect(failed).toBe(true);
});
