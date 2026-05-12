// makeDurableBinding behavior.
import { test, expect } from "vitest";
import { makeDurableBinding, type DurableBindingKind } from "../src/security/durable-binding.js";

test("b6 make morpho mentions org", async () => {
  const b = makeDurableBinding("morpho-blue-market-id", "x");
  expect(b.provenanceHint).toMatch(/morpho\.org/);
});
