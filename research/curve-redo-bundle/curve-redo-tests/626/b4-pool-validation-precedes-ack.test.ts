// Pool validation (server-side trust source) should appear before the ack
// assignment — otherwise the ack lands on unvalidated input.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("ensureSupportedCurvePool call precedes the ack assignment in source order", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  const poolIdx = src.indexOf("ensureSupportedCurvePool");
  const ackIdx = src.indexOf("acknowledgedNonProtocolTarget");
  if (poolIdx > 0 && ackIdx > 0) {
    expect(poolIdx).toBeLessThan(ackIdx);
  }
});
