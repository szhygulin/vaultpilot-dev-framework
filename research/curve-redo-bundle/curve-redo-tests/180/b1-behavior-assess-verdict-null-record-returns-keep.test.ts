import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: null utility record falls back to keep", () => {
  const section = { id: "s-new", bytes: 1500 } as any;
  const v = verdict(section, null as any, 1.0);
  assert.equal(v, "keep");
});
