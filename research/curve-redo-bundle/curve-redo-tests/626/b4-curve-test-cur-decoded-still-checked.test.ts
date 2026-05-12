// Regression: the existing `cur.decoded.functionName === 'exchange'`
// assertions must still appear (PR #628 added to, didn't remove, them).
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("test still asserts cur.decoded.functionName equals 'exchange'", () => {
  const src = readFileSync(resolve(process.cwd(), "test/curve-v1.test.ts"), "utf8");
  expect(src).toMatch(/decoded\??\.functionName.*exchange/);
});
