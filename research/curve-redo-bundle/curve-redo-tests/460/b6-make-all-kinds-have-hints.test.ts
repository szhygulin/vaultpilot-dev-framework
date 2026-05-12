// makeDurableBinding behavior.
import { test, expect } from "vitest";
import { makeDurableBinding, type DurableBindingKind } from "../src/security/durable-binding.js";

test("b6 make all kinds have hints", async () => {
  const kinds: DurableBindingKind[] = ["solana-validator-vote-pubkey","tron-super-representative-address","compound-comet-address","morpho-blue-market-id","marginfi-bank-pubkey","uniswap-v3-lp-token-id","btc-multisig-cosigner-xpub","approval-spender-address"];
  for (const k of kinds) { const b = makeDurableBinding(k, "x"); expect(b.provenanceHint.length).toBeGreaterThan(20); }
});
