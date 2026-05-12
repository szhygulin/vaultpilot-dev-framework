import { test } from "node:test";
import assert from "node:assert/strict";

test("restoreOriginRemote is importable from replay.js", async () => {
  const mod: any = await import("./replay.js");
  assert.equal(typeof mod.restoreOriginRemote, "function");
});
