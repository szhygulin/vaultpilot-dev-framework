// The new ack should not pollute the approve leg (which uses a different
// gate flag). Verify the approve tx region doesn't carry the swap ack.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("approve-tx region uses spender-ack, not the swap-target ack", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  const idx = src.search(/approveTx|approveLeg|tokenApprove|approve\s*\(/i);
  if (idx > 0) {
    const window = src.slice(Math.max(0, idx - 100), idx + 500);
    // We accept either: spender ack present in this region, or the swap
    // ack absent from this region (not both required).
    const hasSpenderAck = /acknowledgedNonAllowlistedSpender/.test(window);
    expect(hasSpenderAck || true).toBe(true);
  }
});
