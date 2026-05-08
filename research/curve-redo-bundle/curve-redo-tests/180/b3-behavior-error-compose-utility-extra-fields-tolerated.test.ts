// Forward-compat: future fields shouldn't crash the composer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility: extra unknown fields are ignored, not crashed on", () => {
  let u: unknown;
  assert.doesNotThrow(() => {
    u = composeUtility({
      futureSignal: "banana",
      garbage: { nested: true },
      __proto__: null,
    } as any);
  });
  assert.equal(typeof u, "number");
  assert.ok(Number.isFinite(u as number));
});
