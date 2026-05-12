// Defensive: ack should not be sprinkled on every UnsignedTx blanket-style.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("acknowledgedNonProtocolTarget assignment count is bounded (not blanket-applied)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  const matches = src.match(/acknowledgedNonProtocolTarget/g) || [];
  // The fix touches only buildCurveSwap; bounded reasonable count.
  expect(matches.length).toBeLessThan(20);
});
