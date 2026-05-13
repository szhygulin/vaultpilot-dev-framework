// makeDurableBinding behavior.
import { test, expect } from "vitest";
import { makeDurableBinding, type DurableBindingKind } from "../src/security/durable-binding.js";

test("b6 make marginfi mentions com", async () => {
  const b = makeDurableBinding("marginfi-bank-pubkey", "x");
  expect(b.provenanceHint).toMatch(/marginfi\.com/);
});
