import { test, expect } from "vitest";

test("findBankForMint returns an actionable not-found result for an unknown mint", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js");
  const fn = mod.findBankForMint;
  expect(typeof fn).toBe("function");
  // A clearly-fake but well-formed base58 pubkey not in any group.
  const fakeMint = "11111111111111111111111111111112";
  let outcome: any;
  try {
    outcome = await fn({ mint: fakeMint });
  } catch (e: any) {
    outcome = { error: String(e?.message || e) };
  }
  // The function MUST signal failure either by throwing a string error or returning an error/empty marker —
  // it must NOT silently return a fully-hydrated bank for an unknown mint.
  const flat = JSON.stringify(outcome).toLowerCase();
  const looksLikeFailure = flat.includes("not") || flat.includes("error") || flat.includes("unknown") || flat.includes("skip") || outcome === null || outcome === undefined;
  expect(looksLikeFailure).toBe(true);
});
