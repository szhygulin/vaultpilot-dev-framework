// makeDurableBinding behavior.
import { test, expect } from "vitest";
import { makeDurableBinding, type DurableBindingKind } from "../src/security/durable-binding.js";

test("b6 make solana validator source", async () => {
  const b = makeDurableBinding("solana-validator-vote-pubkey", "x");
  expect(b.provenanceHint).toMatch(/stakewiz|validators\.app/);
});
