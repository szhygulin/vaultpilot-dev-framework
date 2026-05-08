import { test, expect } from "vitest";

test("prepare_marginfi_borrow rejects an unknown symbol", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js");
  const fn = mod.prepareMarginfiBorrow || mod.prepare_marginfi_borrow || mod.prepareBorrow;
  expect(typeof fn).toBe("function");
  let failed = false;
  try {
    const r = await fn({ symbol: "NOT_A_REAL_TOKEN_XYZZY", amount: "1", owner: "11111111111111111111111111111112" });
    if (r && typeof r === "object" && ("error" in r || "errors" in r)) failed = true;
  } catch {
    failed = true;
  }
  expect(failed).toBe(true);
});
