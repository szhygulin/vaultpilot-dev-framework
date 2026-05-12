// makeDurableBinding behavior.
import { test, expect } from "vitest";
import { makeDurableBinding, type DurableBindingKind } from "../src/security/durable-binding.js";

test("b6 make returns kind id", async () => {
  const b = makeDurableBinding("compound-comet-address", "0xCometAddr");
  expect(b.kind).toBe("compound-comet-address");
  expect(b.identifier).toBe("0xCometAddr");
});
