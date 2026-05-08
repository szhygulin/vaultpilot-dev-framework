import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: partial utility record returns a valid verdict literal", () => {
  const section = { id: "s0", bytes: 100 } as any;
  const record = { references: 5, reinforcement: 5, ref: 5 } as any;
  const result = verdict(section, record, 1.0);
  assert.ok(["keep", "trim", "drop"].includes(result), `unexpected verdict literal: ${String(result)}`);
});
