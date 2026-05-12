// The ack must be set UNCONDITIONALLY (not gated on a flag the user
// has to pass). Issue #626's framing originally proposed gating on
// `acknowledgeNonAllowlistedSpender` (which the native→ERC-20 direction
// never passes); the chosen fix stamps the flag from server-side
// validation, so it lands on every code path that reaches buildCurveSwap.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("ack assignment is not wrapped in a user-flag conditional", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  const ackIdx = src.indexOf("acknowledgedNonProtocolTarget");
  expect(ackIdx).toBeGreaterThan(-1);
  // The 200 chars before the ack should be inside an object literal
  // (no `if (...)` block opening between).
  const window = src.slice(Math.max(0, ackIdx - 200), ackIdx);
  expect(window).not.toMatch(/if\s*\([^)]*acknowledge/);
});
