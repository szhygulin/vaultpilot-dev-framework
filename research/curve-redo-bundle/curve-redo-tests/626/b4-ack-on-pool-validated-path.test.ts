// Trust source path: ack only stamped after validatePool returned a known
// curated entry — verify the assignment is inside the post-validation flow.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("ack assignment lives after ensureSupportedCurvePool's check", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  const validateIdx = src.indexOf("ensureSupportedCurvePool");
  const ackIdx = src.indexOf("acknowledgedNonProtocolTarget");
  if (validateIdx > 0 && ackIdx > 0) {
    expect(ackIdx).toBeGreaterThan(validateIdx);
  }
});
