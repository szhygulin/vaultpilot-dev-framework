import { test, expect } from "vitest";

test("findBankForMint rejects an empty mint string with an error path", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js");
  const fn = mod.findBankForMint;
  expect(typeof fn).toBe("function");
  let threwOrFailed = false;
  try {
    const r = await fn({ mint: "" });
    if (r === null || r === undefined) threwOrFailed = true;
    if (typeof r === "object" && r && ("error" in r || "skipped" in r)) threwOrFailed = true;
  } catch {
    threwOrFailed = true;
  }
  expect(threwOrFailed).toBe(true);
});
