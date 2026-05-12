// makeDurableBinding behavior.
import { test, expect } from "vitest";
import { makeDurableBinding, type DurableBindingKind } from "../src/security/durable-binding.js";

test("b6 make compound mentions finance", async () => {
  const b = makeDurableBinding("compound-comet-address", "x");
  expect(b.provenanceHint).toMatch(/compound\.finance/);
});
