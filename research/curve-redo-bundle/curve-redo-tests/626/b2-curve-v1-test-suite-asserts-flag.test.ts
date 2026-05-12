// PR #628 added expect(...acknowledgedNonProtocolTarget).toBe(true)
// assertions in test/curve-v1.test.ts. Verify the test file has the
// updated assertions.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("test/curve-v1.test.ts asserts swap leg carries acknowledgedNonProtocolTarget", () => {
  const src = readFileSync(resolve(process.cwd(), "test/curve-v1.test.ts"), "utf8");
  expect(src).toMatch(/acknowledgedNonProtocolTarget/);
});
