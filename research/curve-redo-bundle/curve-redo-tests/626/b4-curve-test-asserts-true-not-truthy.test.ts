// Assertion should be toBe(true), not toBeTruthy — explicit boolean.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("at least one ack assertion uses toBe(true) (strict equality)", () => {
  const src = readFileSync(resolve(process.cwd(), "test/curve-v1.test.ts"), "utf8");
  expect(src).toMatch(/acknowledgedNonProtocolTarget[\s\S]{0,80}toBe\(\s*true\s*\)/);
});
