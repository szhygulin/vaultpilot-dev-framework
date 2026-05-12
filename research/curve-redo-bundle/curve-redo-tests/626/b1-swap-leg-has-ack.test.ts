// Issue #626 — Curve pools sit outside classifyDestination's recognized
// set, so the swap leg needs `acknowledgedNonProtocolTarget` to bypass
// `assertTransactionSafe`'s catch-all unknown-destination refusal.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("buildCurveSwap stamps acknowledgedNonProtocolTarget on the swap UnsignedTx", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  expect(src).toMatch(/acknowledgedNonProtocolTarget\s*:\s*true/);
});
