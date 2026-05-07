import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict falls back to 'keep' when utilityRecord is null", () => {
  const result = verdict({ bytes: 1024 } as any, null as any, 1.0);
  assert.equal(result, "keep");
});
