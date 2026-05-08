import { test, expect } from "vitest";
import * as marginfi from "../src/modules/solana/marginfi.js";

// Issue body cites marginfi.ts:769-777: error must say something like
// "skipped at decode — MarginFi shipped an on-chain schema update".
test("the source contains the documented schema-update messaging", async () => {
  // Read the module text via Node's module resolution; we can at least confirm
  // the export string lives in the bundle by stringifying every exported function.
  const blob = Object.values(marginfi)
    .map((v) => (typeof v === "function" ? v.toString() : ""))
    .join("\n");
  expect(blob).toMatch(/schema update|skipped at decode/i);
});
