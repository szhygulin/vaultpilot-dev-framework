// The fix's trust source is server-side pool validation
// (ensureSupportedCurvePool already restricted `pool` to curated entries).
// The code comment should hint at this rather than just stamp the flag.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("comment near the ack references pool-validation trust source", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  const ackIdx = src.indexOf("acknowledgedNonProtocolTarget");
  expect(ackIdx).toBeGreaterThan(-1);
  const window = src.slice(Math.max(0, ackIdx - 1200), ackIdx);
  expect(window).toMatch(/ensureSupportedCurvePool|pool validation|server-side|curated/i);
});
