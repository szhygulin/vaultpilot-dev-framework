// The ack must be inside buildCurveSwap (not some unrelated helper).
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("acknowledgedNonProtocolTarget appears within buildCurveSwap's scope", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  const start = src.indexOf("buildCurveSwap");
  expect(start).toBeGreaterThan(-1);
  // window: from buildCurveSwap declaration to end of file
  const window = src.slice(start);
  expect(window).toMatch(/acknowledgedNonProtocolTarget/);
});
