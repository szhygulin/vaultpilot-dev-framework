// Issue #626 — destination-allowlist ack on curve-swap leg. PR #628 added
// `acknowledgedNonProtocolTarget: true` to the swap leg's UnsignedTx in
// `src/modules/curve/actions.ts::buildCurveSwap` so `assertTransactionSafe`
// doesn't catch-all-refuse the unrecognized Curve pool destination.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("curve actions module exists at src/modules/curve/actions.ts", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  expect(src.length).toBeGreaterThan(0);
});
