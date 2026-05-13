// makeDurableBinding behavior.
import { test, expect } from "vitest";
import { makeDurableBinding, type DurableBindingKind } from "../src/security/durable-binding.js";

test("b6 make provenance non empty", async () => {
  const b = makeDurableBinding("compound-comet-address", "0xCometAddr");
  expect(typeof b.provenanceHint).toBe("string");
  expect(b.provenanceHint.length).toBeGreaterThan(20);
});
