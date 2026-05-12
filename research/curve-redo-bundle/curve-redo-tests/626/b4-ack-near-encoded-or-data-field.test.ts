// The ack should sit inside the same UnsignedTx literal as the calldata /
// data / chain fields.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("ack-bearing object literal contains a calldata-related field nearby", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  const ackIdx = src.indexOf("acknowledgedNonProtocolTarget");
  expect(ackIdx).toBeGreaterThan(-1);
  const window = src.slice(Math.max(0, ackIdx - 800), ackIdx + 300);
  expect(window).toMatch(/\bdata\s*:|encoded|calldata|functionName|chain\s*:/);
});
