import { test } from "node:test";
import assert from "node:assert/strict";

test("MUSL_LOADER_PATH is exported as a string", async () => {
  const mod: any = await import("./sdkBinary.js");
  assert.equal(typeof mod.MUSL_LOADER_PATH, "string");
  assert.match(mod.MUSL_LOADER_PATH, /ld-musl/);
});
