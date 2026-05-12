import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("curve-v1.test.ts asserts ack equals true (toBe(true) shape)", () => {
  const src = readFileSync(resolve(process.cwd(), "test/curve-v1.test.ts"), "utf8");
  expect(src).toMatch(/acknowledgedNonProtocolTarget[\s\S]{0,60}toBe\(\s*true\s*\)/);
});
