import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("rationale comment names the trust source as upstream pool validation", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  expect(src).toMatch(/upstream|server-side|pool validation|curated entry|ensureSupportedCurvePool/i);
});
