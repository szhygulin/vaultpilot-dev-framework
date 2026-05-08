import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: undefined utility record falls back to 'keep' (no signal yet)", () => {
  const section = { id: "s0", bytes: 200, heading: "Brand new rule", body: "never cited" } as any;
  const result = verdict(section, undefined as any, 1.0);
  assert.equal(result, "keep");
});
