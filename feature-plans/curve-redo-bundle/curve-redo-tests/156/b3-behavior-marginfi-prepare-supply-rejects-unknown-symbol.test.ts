import { test, expect } from "vitest";

test("prepare_marginfi_supply rejects an unknown symbol with an actionable error", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js");
  const candidates = [mod.prepareMarginfiSupply, mod.prepare_marginfi_supply, mod.prepareSupply];
  const fn = candidates.find((c) => typeof c === "function");
  expect(typeof fn).toBe("function");
  let errMsg = "";
  let threw = false;
  try {
    const r = await fn({ symbol: "NOT_A_REAL_TOKEN_XYZZY", amount: "1", owner: "11111111111111111111111111111112" });
    if (typeof r === "object" && r && "error" in r) errMsg = String((r as any).error);
    if (!errMsg && typeof r === "object" && r && "errors" in r) errMsg = JSON.stringify((r as any).errors);
  } catch (e: any) {
    threw = true;
    errMsg = String(e?.message || e);
  }
  expect(threw || errMsg.length > 0).toBe(true);
  expect(errMsg.toLowerCase()).not.toBe("");
});
