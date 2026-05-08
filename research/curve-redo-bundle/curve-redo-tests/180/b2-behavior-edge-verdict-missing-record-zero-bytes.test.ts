import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("missing utility record + bytes=0 returns 'keep' without throwing", () => {
  const result = verdict({ bytes: 0 } as any, undefined as any, 1.0);
  assert.equal(result, "keep");
});
