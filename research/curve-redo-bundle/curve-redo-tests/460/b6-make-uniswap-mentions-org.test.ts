// makeDurableBinding behavior.
import { test, expect } from "vitest";
import { makeDurableBinding, type DurableBindingKind } from "../src/security/durable-binding.js";

test("b6 make uniswap mentions org", async () => {
  const b = makeDurableBinding("uniswap-v3-lp-token-id", "x");
  expect(b.provenanceHint).toMatch(/uniswap\.org/);
});
