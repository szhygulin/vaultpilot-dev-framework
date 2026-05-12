// makeDurableBinding behavior.
import { test, expect } from "vitest";
import { makeDurableBinding, type DurableBindingKind } from "../src/security/durable-binding.js";

test("b6 make btc cosigner backup", async () => {
  const b = makeDurableBinding("btc-multisig-cosigner-xpub", "x");
  expect(b.provenanceHint).toMatch(/backup card/i);
});
