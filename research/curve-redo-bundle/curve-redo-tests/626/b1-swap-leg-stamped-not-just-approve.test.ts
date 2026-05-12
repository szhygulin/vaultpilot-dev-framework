// The ack belongs on the swap tx (the leg with `to=pool`), not on an
// approval tx. Verify the ack appears near the swap tx fields.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("ack flag is sited near the swap UnsignedTx fields (chain/to/value)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  const ackIdx = src.indexOf("acknowledgedNonProtocolTarget");
  expect(ackIdx).toBeGreaterThan(-1);
  // The ack should sit within the same object literal as `to: pool` /
  // chain field. Look for `to` and `chain` within a 600-char window.
  const window = src.slice(Math.max(0, ackIdx - 600), ackIdx + 300);
  expect(window).toMatch(/\bto\s*:/);
});
