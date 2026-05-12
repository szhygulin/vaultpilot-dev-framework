// makeDurableBinding behavior.
import { test, expect } from "vitest";
import { makeDurableBinding, type DurableBindingKind } from "../src/security/durable-binding.js";

test("b6 make spender mentions etherscan", async () => {
  const b = makeDurableBinding("approval-spender-address", "x");
  expect(b.provenanceHint).toMatch(/etherscan/);
});
