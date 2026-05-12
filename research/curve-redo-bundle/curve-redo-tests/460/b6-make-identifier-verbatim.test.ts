// makeDurableBinding behavior.
import { test, expect } from "vitest";
import { makeDurableBinding, type DurableBindingKind } from "../src/security/durable-binding.js";

test("b6 make identifier verbatim", async () => {
  const id = "0x" + "a".repeat(64);
  const b = makeDurableBinding("morpho-blue-market-id", id);
  expect(b.identifier).toBe(id);
});
