// The ack must be `true` (not `false`); a `false` value would still fail
// the gate.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("acknowledgedNonProtocolTarget value is set to true, not false", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  expect(src).toMatch(/acknowledgedNonProtocolTarget\s*:\s*true/);
  // Negative check: there should NOT be a `acknowledgedNonProtocolTarget: false` in actions.ts.
  expect(src).not.toMatch(/acknowledgedNonProtocolTarget\s*:\s*false/);
});
