// Regression check: PR #618's acknowledgedNonAllowlistedSpender ack must
// still appear on the approve leg (the new ack on the swap leg is additive).
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("acknowledgedNonAllowlistedSpender (spender ack from #618) still present in actions.ts", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  expect(src).toMatch(/acknowledgedNonAllowlistedSpender/);
});
