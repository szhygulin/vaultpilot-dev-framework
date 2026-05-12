// PR #628 added at least 3 toBe(true) assertions on the new flag across
// legacy + stable_ng + multi-leg test cases.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("curve-v1.test.ts has at least 2 separate ack.toBe(true) assertions", () => {
  const src = readFileSync(resolve(process.cwd(), "test/curve-v1.test.ts"), "utf8");
  const matches = src.match(/acknowledgedNonProtocolTarget[\s\S]{0,80}toBe\(\s*true/g) || [];
  expect(matches.length).toBeGreaterThanOrEqual(2);
});
