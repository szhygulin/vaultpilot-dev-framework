// Threshold 1.5 default.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 threshold default", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/positions/index.ts"), "utf8");
  expect(src).toMatch(/threshold\s*=\s*args\.threshold\s*\?\?\s*1\.5/);
});
