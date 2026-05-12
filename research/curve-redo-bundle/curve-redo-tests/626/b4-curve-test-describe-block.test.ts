import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("test/curve-v1.test.ts has a describe block for buildCurveSwap", () => {
  const src = readFileSync(resolve(process.cwd(), "test/curve-v1.test.ts"), "utf8");
  expect(src).toMatch(/describe\(\s*['"][^'"]*buildCurveSwap/);
});
