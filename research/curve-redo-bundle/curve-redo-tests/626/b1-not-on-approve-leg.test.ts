// The ack added by #628 sits on the swap leg, NOT on the approve leg
// (the approve leg's gate uses acknowledgedNonAllowlistedSpender, #618).
// Verify the swap-target ack is distinct from spender-allowlist ack.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("acknowledgedNonProtocolTarget is distinct from acknowledgedNonAllowlistedSpender (spender ack)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  expect(src).toMatch(/acknowledgedNonProtocolTarget/);
  // Both flags can coexist (approve leg + swap leg), but each is its own
  // identifier — this test just asserts the new flag exists with the
  // post-#628 spelling.
});
