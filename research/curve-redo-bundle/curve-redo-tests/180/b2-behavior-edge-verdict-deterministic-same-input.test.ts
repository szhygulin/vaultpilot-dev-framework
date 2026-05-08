import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict is deterministic for repeated identical calls", () => {
  const section = { bytes: 2048 } as any;
  const r1 = verdict(section, undefined as any, 1.5);
  const r2 = verdict(section, undefined as any, 1.5);
  const r3 = verdict(section, undefined as any, 1.5);
  assert.equal(r1, r2);
  assert.equal(r2, r3);
});
