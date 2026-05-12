// The approve-leg's acknowledgedNonAllowlistedSpender assertion should
// still be present alongside the new ack (regression).
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("curve-v1.test.ts retains acknowledgedNonAllowlistedSpender assertion", () => {
  const src = readFileSync(resolve(process.cwd(), "test/curve-v1.test.ts"), "utf8");
  expect(src).toMatch(/acknowledgedNonAllowlistedSpender/);
});
