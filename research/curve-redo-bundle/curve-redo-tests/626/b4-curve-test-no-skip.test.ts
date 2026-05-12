import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("curve-v1.test.ts has no test.skip / describe.skip in the ack region", () => {
  const src = readFileSync(resolve(process.cwd(), "test/curve-v1.test.ts"), "utf8");
  const ackIdx = src.indexOf("acknowledgedNonProtocolTarget");
  if (ackIdx > 0) {
    const window = src.slice(Math.max(0, ackIdx - 800), ackIdx + 200);
    expect(window).not.toMatch(/\b(it|describe|test)\.skip\(/);
  }
});
