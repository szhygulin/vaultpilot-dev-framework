// makeDurableBinding behavior.
import { test, expect } from "vitest";
import { makeDurableBinding, type DurableBindingKind } from "../src/security/durable-binding.js";

test("b6 make tron mentions tronscan", async () => {
  const b = makeDurableBinding("tron-super-representative-address", "x");
  expect(b.provenanceHint).toMatch(/tronscan/);
});
